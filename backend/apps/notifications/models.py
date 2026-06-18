from django.db import models
from django.conf import settings
from apps.core.models import BaseModel, TenantModel

class Notification(TenantModel):
    """
    Alerts dispatched to individual organization members in real-time.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications'
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    is_read = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user.email} - {self.title} (Read: {self.is_read})"


class EmailSetting(TenantModel):
    EMAIL_TYPES = (
        ('welcome', 'Welcome Email'),
        ('verification', 'Email Verification Required'),
        ('verified', 'Email Verified Successfully'),
        ('password_reset', 'Password Reset Link'),
        ('password_changed', 'Password Changed Alert'),
        ('login_detected', 'New Login Alert'),
        ('account_locked', 'Account Security Lockout Alert'),
        ('org_invite', 'Organization Workspace Invitation'),
        ('org_added', 'Added to Workspace Alert'),
        ('role_changed', 'Workspace Role Changed Alert'),
        ('org_removed', 'Removed from Workspace Alert'),
        ('customer_created', 'Customer Onboarding Alert'),
        ('customer_updated', 'Customer Profile Updated Notice'),
        ('customer_portal_created', 'Customer Portal Created Alert'),
        ('customer_portal_invited', 'Customer Portal Invitation'),
        ('customer_portal_activated', 'Customer Portal Account Activated'),
        ('invoice_draft', 'Invoice Draft Created Alert'),
        ('invoice_finalized', 'Invoice Finalized Alert'),
        ('invoice_sent', 'Invoice Copy Sent to Client'),
        ('invoice_viewed', 'Invoice Viewed by Client Alert'),
        ('invoice_updated', 'Invoice Details Updated Alert'),
        ('invoice_cancelled', 'Invoice Cancelled Alert'),
        ('invoice_paid', 'Invoice Fully Paid Alert'),
        ('invoice_partially_paid', 'Invoice Partially Paid Alert'),
        ('invoice_overdue', 'Invoice Overdue Notice'),
        ('invoice_reopened', 'Invoice Reopened Alert'),
        ('payment_received', 'Payment Receipt Confirmation'),
        ('payment_failed', 'Payment Transaction Failed Alert'),
        ('refund_processed', 'Refund Processed Confirmation'),
        ('credit_note_issued', 'Credit Note Issued Notification'),
        ('org_created', 'Organization Created Alert'),
        ('org_settings_changed', 'Organization Settings Changed Alert'),
        ('org_billing_updated', 'Billing Settings Updated Notice'),
        ('sub_active', 'Subscription Activated Confirmation'),
        ('sub_renewed', 'Subscription Renewed Alert'),
        ('sub_expiring', 'Subscription Expiring Notice'),
        ('sub_cancelled', 'Subscription Cancelled Alert'),
        ('product_created', 'New Product Catalog Created'),
        ('product_price_updated', 'Catalog Pricing Updated Notice'),
        ('product_low_stock', 'Product Catalog Low Inventory Warning'),
        ('product_out_of_stock', 'Product Catalog Out of Stock Warning'),
        ('daily_summary', 'Daily Business Activity Summary'),
        ('weekly_summary', 'Weekly Business Activity Summary'),
        ('monthly_summary', 'Monthly Business Activity Summary'),
    )
    email_type = models.CharField(max_length=50, choices=EMAIL_TYPES)
    is_enabled = models.BooleanField(default=True)

    class Meta:
        unique_together = ('organization', 'email_type')

    def __str__(self):
        return f"{self.organization.name} - {self.get_email_type_display()} ({'Enabled' if self.is_enabled else 'Disabled'})"


class EmailLog(BaseModel):
    STATUS_CHOICES = (
        ('pending', 'Pending'),
        ('sent', 'Sent'),
        ('failed', 'Failed'),
    )
    organization = models.ForeignKey(
        'organizations.Organization',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='email_logs'
    )
    recipient = models.EmailField()
    subject = models.CharField(max_length=255)
    template_name = models.CharField(max_length=100)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='pending')
    error_message = models.TextField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    idempotency_hash = models.CharField(max_length=64, unique=True, db_index=True)
    context_data = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"{self.recipient} - {self.subject} ({self.status})"


class ReminderSchedule(TenantModel):
    days_before_due = models.IntegerField(default=7, help_text="Number of days before the invoice due date to send a reminder.")
    overdue_interval_days = models.IntegerField(default=3, help_text="Send a reminder every N days after the due date if still unpaid.")
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.organization.name} - Upcoming: -{self.days_before_due}d, Overdue: every {self.overdue_interval_days}d"

class EmailAlertLog(TenantModel):
    """
    Tracks low stock alerts to prevent spamming multiple times for the same product on the same day.
    """
    alert_type = models.CharField(max_length=50, db_index=True)
    target_id = models.UUIDField(db_index=True)
    created_date = models.DateField(auto_now_add=True, db_index=True)

    class Meta:
        unique_together = ('organization', 'alert_type', 'target_id', 'created_date')

    def __str__(self):
        return f"{self.organization.name} - {self.alert_type} for {self.target_id} on {self.created_date}"
