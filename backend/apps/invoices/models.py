from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.core.models import BaseModel, TenantModel
from apps.customers.models import Customer
from apps.products.models import Product

class Invoice(TenantModel):
    """
    Core Invoice model tracking billing details, statuses, totals, and documents.
    """
    STATUS_CHOICES = (
        ('draft', 'Draft'),
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('sent', 'Sent'),
        ('viewed', 'Viewed'),
        ('partially_paid', 'Partially Paid'),
        ('paid', 'Paid'),
        ('overdue', 'Overdue'),
        ('cancelled', 'Cancelled'),
        ('refunded', 'Refunded'),
    )

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='invoices')
    invoice_number = models.CharField(max_length=100, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft', db_index=True)
    
    issue_date = models.DateField(default=timezone.now, db_index=True)
    due_date = models.DateField(db_index=True)
    
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    amount_paid = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    
    currency = models.CharField(max_length=10, default='INR')
    terms = models.TextField(blank=True, null=True)
    notes = models.TextField(blank=True, null=True)
    pdf_url = models.URLField(max_length=500, blank=True, null=True)

    class Meta:
        unique_together = ('organization', 'invoice_number')

    def __str__(self):
        return f"{self.invoice_number} ({self.customer.contact_name})"

    def save(self, *args, **kwargs):
        # Auto-generate invoice number if not set
        if not self.invoice_number:
            year = self.issue_date.year
            # Avoid using standard scoped manager to prevent recursive filtering issues
            last_invoice = Invoice.objects.global_all().filter(
                organization=self.organization,
                invoice_number__startswith=f"INV-{year}-"
            ).order_by('-invoice_number').first()
            
            if last_invoice:
                try:
                    last_counter = last_invoice.invoice_number.split('-')[-1]
                    counter = int(last_counter) + 1
                except (ValueError, IndexError):
                    counter = 1
            else:
                counter = 1
                
            self.invoice_number = f"INV-{year}-{counter:06d}"
            
        super().save(*args, **kwargs)
        
        # Invalidate dashboard cache
        from django.core.cache import cache
        cache.delete(f"dashboard_stats_{self.organization_id}")


class InvoiceLineItem(BaseModel):
    """
    Individual items/services billed inside an Invoice.
    """
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='line_items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='+')
    description = models.TextField(blank=True, null=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1.00)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text="e.g. 18.00 representing 18% tax")
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)

    def __str__(self):
        return f"Line for {self.invoice.invoice_number} - {self.product.name}"


class InvoiceWorkflowHistory(BaseModel):
    """
    Logs changes and approval state movements for an invoice (Audit Trail for Workflow).
    """
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='workflow_history')
    action = models.CharField(max_length=50, help_text="e.g. submit, approve, reject, send, record_payment")
    from_status = models.CharField(max_length=20, choices=Invoice.STATUS_CHOICES)
    to_status = models.CharField(max_length=20, choices=Invoice.STATUS_CHOICES)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='+'
    )
    comment = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.invoice.invoice_number} transition: {self.from_status} -> {self.to_status}"


class RecurringInvoiceConfig(TenantModel):
    """
    Schedules automated templates for regenerating invoices recurrently.
    """
    SCHEDULE_CHOICES = (
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('quarterly', 'Quarterly'),
        ('yearly', 'Yearly'),
    )

    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name='+')
    schedule_type = models.CharField(max_length=20, choices=SCHEDULE_CHOICES, default='monthly')
    next_generation_date = models.DateField()
    
    # Store items, rates, descriptions, discount configurations
    template_data = models.JSONField(default=dict, help_text="Structured template for invoice line items, currencies and terms")
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"Recurring {self.schedule_type} configuration for {self.customer.contact_name}"
