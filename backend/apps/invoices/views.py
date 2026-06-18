import logging
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from django.http import HttpResponse
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.core.mixins import ValidationMixin
from apps.invoices.models import Invoice, InvoiceLineItem, InvoiceWorkflowHistory, RecurringInvoiceConfig
from apps.invoices.serializers import InvoiceSerializer, RecurringInvoiceConfigSerializer
from apps.organizations.permissions import HasRolePermission
from apps.invoices.tasks import send_invoice_email_task
from apps.invoices.services import PDFInvoiceGenerator

logger = logging.getLogger(__name__)

class InvoiceViewSet(ValidationMixin, viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [permissions.IsAuthenticated, HasRolePermission]
    search_fields = ['invoice_number', 'customer__contact_name']
    
    # Map actions to custom RBAC permission keys
    required_permissions = {
        'list': 'view_invoices',
        'retrieve': 'view_invoices',
        'create': 'create_invoice',
        'update': 'update_invoice',
        'partial_update': 'update_invoice',
        'destroy': 'delete_invoice',
        'submit_approval': 'create_invoice',
        'approve': 'approve_invoice',
        'reject': 'approve_invoice',
        'send_invoice': 'send_invoice',
        'record_payment': 'approve_invoice',
        'duplicate': 'create_invoice',
        'download_pdf': 'view_invoices'
    }

    def get_queryset(self):
        # Automatically tenant-filtered via TenantManager
        queryset = Invoice.objects.all().select_related('customer').prefetch_related('line_items', 'line_items__product').order_by('-created_at')
        
        # Simple Filter parameters
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
            
        customer_param = self.request.query_params.get('customer')
        if customer_param:
            queryset = queryset.filter(customer_id=customer_param)
            
        return queryset

    def perform_create(self, serializer):
        serializer.save(
            organization_id=self.request.organization_id,
            created_by=self.request.user
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)

    def log_workflow(self, invoice, action_name, from_status, to_status, comment=""):
        InvoiceWorkflowHistory.objects.create(
            invoice=invoice,
            action=action_name,
            from_status=from_status,
            to_status=to_status,
            performed_by=self.request.user,
            comment=comment
        )

    @action(detail=True, methods=['post'], url_path='submit')
    def submit_approval(self, request, pk=None):
        """Submit draft invoice for approval."""
        invoice = self.get_object()
        if invoice.status != 'draft':
            return Response({'error': 'Only draft invoices can be submitted for approval.'}, status=status.HTTP_400_BAD_REQUEST)
            
        old_status = invoice.status
        invoice.status = 'pending'
        invoice.save(update_fields=['status'])
        
        self.log_workflow(invoice, 'submit', old_status, 'pending', request.data.get('comment', 'Submitted for manager review.'))
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, pk=None):
        """Approve a pending invoice."""
        invoice = self.get_object()
        if invoice.status != 'pending':
            return Response({'error': 'Only pending invoices can be approved.'}, status=status.HTTP_400_BAD_REQUEST)
            
        old_status = invoice.status
        invoice.status = 'approved'
        invoice.save(update_fields=['status'])
        
        self.log_workflow(invoice, 'approve', old_status, 'approved', request.data.get('comment', 'Invoice approved.'))
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """Reject and return invoice to draft state."""
        invoice = self.get_object()
        if invoice.status != 'pending':
            return Response({'error': 'Only pending invoices can be rejected.'}, status=status.HTTP_400_BAD_REQUEST)
            
        old_status = invoice.status
        invoice.status = 'draft'
        invoice.save(update_fields=['status'])
        
        self.log_workflow(invoice, 'reject', old_status, 'draft', request.data.get('comment', 'Invoice rejected.'))
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=['post'], url_path='send')
    def send_invoice(self, request, pk=None):
        """Queue email send with PDF attachment."""
        invoice = self.get_object()
        if invoice.status in ['draft', 'pending']:
            return Response({'error': 'Invoice must be approved before sending.'}, status=status.HTTP_400_BAD_REQUEST)
            
        old_status = invoice.status
        # Async trigger email send
        send_invoice_email_task.delay(str(invoice.id))
        
        if invoice.status == 'approved':
            invoice.status = 'sent'
            invoice.save(update_fields=['status'])
            self.log_workflow(invoice, 'send', old_status, 'sent', 'Invoice PDF dispatched via email.')
            
        return Response({'message': 'Invoice delivery queued.'})

    @action(detail=True, methods=['post'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        """Record manual cash/wire/card payment."""
        invoice = self.get_object()
        amount_str = request.data.get('amount')
        if not amount_str:
            return Response({'error': 'Payment amount is required.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            amount = Decimal(str(amount_str))
        except ValueError:
            return Response({'error': 'Invalid amount.'}, status=status.HTTP_400_BAD_REQUEST)
            
        old_status = invoice.status
        
        # In a fully-featured accounting engine, we track billing accounts, 
        # but here we simply mark invoice status based on amount comparison
        invoice.amount_paid += amount
        if invoice.amount_paid >= invoice.total_amount:
            invoice.status = 'paid'
        else:
            invoice.status = 'partially_paid'
        invoice.save(update_fields=['status', 'amount_paid'])
        
        self.log_workflow(invoice, 'record_payment', old_status, invoice.status, f"Payment of {invoice.currency} {amount} recorded.")
        return Response(InvoiceSerializer(invoice).data)

    @action(detail=True, methods=['post'], url_path='duplicate')
    def duplicate(self, request, pk=None):
        """Clone an existing invoice as draft, using current catalog item descriptions/prices."""
        source = self.get_object()
        
        # Create draft invoice
        invoice = Invoice.objects.create(
            organization_id=self.request.organization_id,
            customer=source.customer,
            status='draft',
            issue_date=timezone.now().date(),
            due_date=timezone.now().date() + timedelta(days=30),
            subtotal=Decimal('0.00'),
            tax_amount=Decimal('0.00'),
            discount_amount=source.discount_amount,
            total_amount=Decimal('0.00'),
            currency=source.currency,
            terms=source.terms,
            notes=source.notes,
            created_by=request.user
        )
        
        # Clone items with current product master data
        subtotal = Decimal('0.00')
        tax_amount = Decimal('0.00')
        
        for item in source.line_items.all():
            product = item.product
            # Use current product master values
            price = product.price
            desc = product.description or ''
            tax_rate = product.tax_rate
            
            line_subtotal = item.quantity * price
            line_tax = line_subtotal * (tax_rate / Decimal('100.00'))
            line_total = line_subtotal + line_tax
            
            subtotal += line_subtotal
            tax_amount += line_tax
            
            InvoiceLineItem.objects.create(
                invoice=invoice,
                product=product,
                description=desc,
                quantity=item.quantity,
                unit_price=price,
                tax_rate=tax_rate,
                tax_amount=line_tax,
                total_amount=line_total
            )
            
        # Re-calculate totals
        invoice.subtotal = subtotal
        invoice.tax_amount = tax_amount
        invoice.total_amount = max(subtotal + tax_amount - source.discount_amount, Decimal('0.00'))
        invoice.save(update_fields=['subtotal', 'tax_amount', 'total_amount'])
            
        self.log_workflow(invoice, 'create', 'draft', 'draft', f"Duplicated from {source.invoice_number}")
        return Response(InvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='download')
    def download_pdf(self, request, pk=None):
        """Generates PDF directly on the fly."""
        invoice = self.get_object()
        pdf_buffer = PDFInvoiceGenerator.generate_pdf(invoice)
        
        response = HttpResponse(pdf_buffer.read(), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="invoice_{invoice.invoice_number}.pdf"'
        return response


class RecurringInvoiceConfigViewSet(viewsets.ModelViewSet):
    serializer_class = RecurringInvoiceConfigSerializer
    permission_classes = [permissions.IsAuthenticated, HasRolePermission]
    
    required_permissions = {
        'list': 'view_invoices',
        'retrieve': 'view_invoices',
        'create': 'create_invoice',
        'update': 'update_invoice',
        'partial_update': 'update_invoice',
        'destroy': 'delete_invoice'
    }

    def get_queryset(self):
        return RecurringInvoiceConfig.objects.all()

    def perform_create(self, serializer):
        serializer.save(
            organization_id=self.request.organization_id,
            created_by=self.request.user
        )

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)
