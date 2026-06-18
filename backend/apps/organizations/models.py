import uuid
from django.db import models
from django.conf import settings
from apps.core.models import BaseModel
from apps.core.validators import phone_validator

class Organization(BaseModel):
    """
    The tenant entity representing the subscriber organization / company.
    """
    name = models.CharField(max_length=255)
    tax_number = models.CharField(max_length=50, blank=True, null=True, help_text="e.g. GSTIN, VAT ID")
    email = models.EmailField()
    phone = models.CharField(max_length=10, validators=[phone_validator], blank=True, null=True)
    currency = models.CharField(max_length=10, default='INR')
    logo_url = models.URLField(max_length=500, blank=True, null=True)
    billing_address = models.JSONField(default=dict, blank=True)
    
    # Payment Configuration
    payment_upi_id = models.CharField(max_length=100, blank=True, null=True, help_text="Configured UPI ID for receiving payments.")
    payment_merchant_name = models.CharField(max_length=255, blank=True, null=True, help_text="Extracted or configured merchant name for the UPI QR.")
    payment_qr_code = models.ImageField(upload_to='qrcodes/', blank=True, null=True, help_text="Auto-generated clean QR Code based on the UPI ID.")
    
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='owned_organizations'
    )

    def __str__(self):
        return self.name


class UserOrganizationMembership(BaseModel):
    """
    Maps Users to Organizations and defines their role inside that organization.
    """
    ROLE_CHOICES = (
        ('owner', 'Owner'),
        ('admin', 'Admin'),
        ('manager', 'Manager'),
        ('accountant', 'Accountant'),
        ('employee', 'Employee'),
        ('viewer', 'Viewer'),
    )

    APPROVAL_STATUS_CHOICES = (
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='memberships'
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='members'
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='viewer')
    approval_status = models.CharField(max_length=20, choices=APPROVAL_STATUS_CHOICES, default='approved')

    class Meta:
        unique_together = ('user', 'organization')

    def __str__(self):
        return f"{self.user.email} - {self.organization.name} ({self.role})"
