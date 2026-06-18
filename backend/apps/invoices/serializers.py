from decimal import Decimal
from rest_framework import serializers
from django.db import transaction
from django.utils import timezone
from apps.invoices.models import Invoice, InvoiceLineItem, InvoiceWorkflowHistory, RecurringInvoiceConfig
from apps.customers.serializers import CustomerSerializer
from apps.products.models import Product

class InvoiceLineItemSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(required=False)
    product_name = serializers.ReadOnlyField(source='product.name')
    description = serializers.CharField(required=False, allow_blank=True)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    tax_rate = serializers.DecimalField(max_digits=5, decimal_places=2, required=False)

    class Meta:
        model = InvoiceLineItem
        fields = ('id', 'product', 'product_name', 'description', 'quantity', 'unit_price', 'tax_rate', 'tax_amount', 'total_amount')
        read_only_fields = ('tax_amount', 'total_amount')

    def validate(self, data):
        product = data.get('product')
        if not product:
            return data
            
        # Enforce price, description, and tax rate match the product master catalog
        if 'unit_price' in data and data['unit_price'] != product.price:
            raise serializers.ValidationError({
                "unit_price": f"Modifying item price is not allowed. Must match product catalog price: {product.price}"
            })
        if 'description' in data and data['description'] != (product.description or ''):
            raise serializers.ValidationError({
                "description": "Modifying item description is not allowed. Must match product catalog description."
            })
        if 'tax_rate' in data and data['tax_rate'] != product.tax_rate:
            raise serializers.ValidationError({
                "tax_rate": f"Modifying tax rate is not allowed. Must match product catalog tax rate: {product.tax_rate}"
            })

        # Auto-fill missing fields from product master
        if 'unit_price' not in data:
            data['unit_price'] = product.price
        if 'description' not in data:
            data['description'] = product.description or ''
        if 'tax_rate' not in data:
            data['tax_rate'] = product.tax_rate

        return data


class InvoiceWorkflowHistorySerializer(serializers.ModelSerializer):
    performed_by_name = serializers.ReadOnlyField(source='performed_by.email')

    class Meta:
        model = InvoiceWorkflowHistory
        fields = ('id', 'action', 'from_status', 'to_status', 'performed_by', 'performed_by_name', 'comment', 'created_at')
        read_only_fields = ('id', 'created_at')


class InvoiceSerializer(serializers.ModelSerializer):
    line_items = InvoiceLineItemSerializer(many=True)
    workflow_history = InvoiceWorkflowHistorySerializer(many=True, read_only=True)
    customer_detail = CustomerSerializer(source='customer', read_only=True)

    class Meta:
        model = Invoice
        fields = (
            'id', 'organization', 'customer', 'customer_detail', 'invoice_number', 'status', 
            'issue_date', 'due_date', 'subtotal', 'tax_amount', 'discount_amount', 
            'total_amount', 'amount_paid', 'currency', 'terms', 'notes', 'pdf_url', 'line_items', 
            'workflow_history', 'created_at', 'updated_at'
        )
        read_only_fields = ('id', 'organization', 'invoice_number', 'subtotal', 'tax_amount', 'total_amount', 'pdf_url', 'created_at', 'updated_at')

    def validate(self, data):
        # Validate due date is after issue date
        issue_date = data.get('issue_date', timezone.now().date())
        due_date = data.get('due_date')
        
        if due_date and due_date < issue_date:
            raise serializers.ValidationError("Due date cannot be earlier than the issue date.")
            
        # Ensure there's at least one line item
        if self.instance is None and not data.get('line_items'):
            raise serializers.ValidationError("An invoice must contain at least one line item.")
            
        return data

    @transaction.atomic
    def create(self, validated_data):
        line_items_data = validated_data.pop('line_items')
        
        # Save invoice
        invoice = Invoice.objects.create(**validated_data)
        
        # Compute and create line items
        subtotal = Decimal('0.00')
        tax_amount = Decimal('0.00')
        
        for item_data in line_items_data:
            qty = item_data.get('quantity', Decimal('1.00'))
            price = item_data.get('unit_price')
            tax_rate = item_data.get('tax_rate', Decimal('0.00'))
            
            line_subtotal = qty * price
            line_tax = line_subtotal * (tax_rate / Decimal('100.00'))
            line_total = line_subtotal + line_tax
            
            subtotal += line_subtotal
            tax_amount += line_tax
            
            InvoiceLineItem.objects.create(
                invoice=invoice,
                product=item_data['product'],
                description=item_data.get('description', ''),
                quantity=qty,
                unit_price=price,
                tax_rate=tax_rate,
                tax_amount=line_tax,
                total_amount=line_total
            )
            
        # Recalculate totals with discount
        discount = validated_data.get('discount_amount', Decimal('0.00'))
        invoice.subtotal = subtotal
        invoice.tax_amount = tax_amount
        invoice.total_amount = max(subtotal + tax_amount - discount, Decimal('0.00'))
        invoice.save(update_fields=['subtotal', 'tax_amount', 'total_amount'])
        
        # Record workflow entry
        InvoiceWorkflowHistory.objects.create(
            invoice=invoice,
            action='create',
            from_status='draft',
            to_status=invoice.status,
            performed_by=self.context['request'].user,
            comment='Invoice created draft.'
        )
        
        return invoice

    @transaction.atomic
    def update(self, instance, validated_data):
        line_items_data = validated_data.pop('line_items', None)
        
        # Save standard fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # If line items are supplied, overwrite
        if line_items_data is not None:
            # Delete old line items
            instance.line_items.all().delete()
            
            subtotal = Decimal('0.00')
            tax_amount = Decimal('0.00')
            
            for item_data in line_items_data:
                qty = item_data.get('quantity', Decimal('1.00'))
                price = item_data.get('unit_price')
                tax_rate = item_data.get('tax_rate', Decimal('0.00'))
                
                line_subtotal = qty * price
                line_tax = line_subtotal * (tax_rate / Decimal('100.00'))
                line_total = line_subtotal + line_tax
                
                subtotal += line_subtotal
                tax_amount += line_tax
                
                InvoiceLineItem.objects.create(
                    invoice=instance,
                    product=item_data['product'],
                    description=item_data.get('description', ''),
                    quantity=qty,
                    unit_price=price,
                    tax_rate=tax_rate,
                    tax_amount=line_tax,
                    total_amount=line_total
                )
                
            discount = validated_data.get('discount_amount', instance.discount_amount)
            instance.subtotal = subtotal
            instance.tax_amount = tax_amount
            instance.total_amount = max(subtotal + tax_amount - discount, Decimal('0.00'))
            instance.save(update_fields=['subtotal', 'tax_amount', 'total_amount'])
            
        return instance


class RecurringInvoiceConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecurringInvoiceConfig
        fields = ('id', 'organization', 'customer', 'schedule_type', 'next_generation_date', 'template_data', 'is_active', 'created_at')
        read_only_fields = ('id', 'organization', 'created_at')
