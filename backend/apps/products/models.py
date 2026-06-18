from django.db import models
from apps.core.models import TenantModel

class Category(TenantModel):
    """
    Represents product/service categories.
    """
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)

    def __str__(self):
        return self.name


class Product(TenantModel):
    """
    Represents inventory products or billed services.
    """
    TYPE_CHOICES = (
        ('product', 'Product'),
        ('service', 'Service'),
    )

    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='products'
    )
    name = models.CharField(max_length=255, db_index=True)
    sku = models.CharField(max_length=100, db_index=True, help_text="Stock keeping unit or unique identifier")
    description = models.TextField(blank=True, null=True)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text="Tax percentage (e.g. 18.00 for 18% GST)")
    hsn_sac_code = models.CharField(max_length=50, blank=True, null=True, help_text="GST HSN code for products or SAC for services")
    
    is_active = models.BooleanField(default=True, db_index=True)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='product', db_index=True)
    inventory_count = models.IntegerField(default=0, help_text="Only applicable for physical products")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'sku'],
                condition=models.Q(deleted_at__isnull=True),
                name='unique_active_sku_per_organization'
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.sku})"

    def save(self, *args, **kwargs):
        from django.db import transaction
        from apps.organizations.models import Organization

        if not self.sku:
            prefix = 'PROD' if self.type == 'product' else 'SER'
            with transaction.atomic():
                # Lock the organization row to prevent concurrent creation collisions for the same tenant
                Organization.objects.select_for_update().get(id=self.organization_id)
                
                last_product = Product.objects.global_all().filter(
                    organization=self.organization,
                    type=self.type,
                    sku__startswith=f"{prefix}-"
                ).order_by('-sku').first()

                if last_product:
                    try:
                        last_counter = int(last_product.sku.split('-')[-1])
                        counter = last_counter + 1
                    except (ValueError, IndexError):
                        counter = 1
                else:
                    counter = 1
                    
                self.sku = f"{prefix}-{counter:05d}"
                
        if not self.hsn_sac_code:
            import random
            if self.type == 'product':
                self.hsn_sac_code = str(random.randint(100000, 999999))
            else:
                self.hsn_sac_code = f"99{random.randint(1000, 9999)}"

        super().save(*args, **kwargs)
