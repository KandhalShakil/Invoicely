from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone
from django.conf import settings
from django.contrib.auth.signals import user_logged_in
from axes.signals import user_locked_out
import logging

from apps.customers.models import Customer
from apps.invoices.models import Invoice
from apps.products.models import Product
from apps.organizations.models import Organization, UserOrganizationMembership
from apps.notifications.models import Notification

logger = logging.getLogger(__name__)

def get_org_id(instance):
    if isinstance(instance, Organization):
        return instance.id
    return getattr(instance, 'organization_id', None)

def send_sync_event(model_name, action, instance):
    org_id = get_org_id(instance)
    if not org_id:
        return
        
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
        
    # Dynamically serialize instance to avoid frontend refetching
    payload_data = None
    if action != 'delete':
        try:
            if model_name == 'customer':
                from apps.customers.serializers import CustomerSerializer
                payload_data = CustomerSerializer(instance).data
            elif model_name == 'product':
                from apps.products.serializers import ProductSerializer
                payload_data = ProductSerializer(instance).data
            elif model_name == 'invoice':
                from apps.invoices.serializers import InvoiceSerializer
                try:
                    payload_data = InvoiceSerializer(instance).data
                except Exception:
                    payload_data = None
        except Exception as e:
            logger.error(f"Failed to serialize payload for {model_name}: {e}")

    # Build sync event payload
    payload = {
        "type": "send_notification",
        "data": {
            "type": "data_changed",
            "model": model_name,
            "action": action,
            "id": str(instance.id),
            "payload": payload_data
        }
    }
    
    # Broadcast to organization group
    try:
        async_to_sync(channel_layer.group_send)(f"org_{org_id}", payload)
        logger.info(f"Broadcasted real-time sync event: {model_name} {action} {instance.id}")
    except Exception as e:
        logger.error(f"Failed to broadcast real-time sync event: {e}")

@receiver(user_logged_in)
def on_user_logged_in(sender, request, user, **kwargs):
    """Trigger email notification when a successful login is registered."""
    try:
        from apps.notifications.tasks import send_transactional_email_task
        ip_address = request.META.get('REMOTE_ADDR', 'Unknown')
        user_agent = request.META.get('HTTP_USER_AGENT', 'Unknown')
        device = "Web Browser"
        if "Mobile" in user_agent:
            device = "Mobile Device"
        elif "Postman" in user_agent:
            device = "Postman Client"
            
        send_transactional_email_task.delay(
            recipient=user.email,
            subject="New Login Detected - Invoicely",
            template_name="login_detected",
            context_data={
                "username": user.first_name or user.email.split('@')[0],
                "timestamp": timezone.now().strftime("%Y-%m-%d %H:%M:%S UTC"),
                "ip_address": ip_address,
                "device_name": device,
            }
        )
    except Exception as e:
        logger.error(f"Error triggering login_detected email: {e}")

@receiver(user_locked_out)
def on_user_locked_out(sender, request, username, ip_address, **kwargs):
    """Trigger email notification when brute-force account lockout fires."""
    try:
        from apps.notifications.tasks import send_transactional_email_task
        if username and '@' in username:
            send_transactional_email_task.delay(
                recipient=username,
                subject="Account Security Lockout Alert - Invoicely",
                template_name="account_locked",
                context_data={
                    "email": username,
                    "ip_address": ip_address or "Unknown",
                }
            )
    except Exception as e:
        logger.error(f"Error triggering account_locked email: {e}")

@receiver(post_save, sender=Customer)
def customer_saved(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    send_sync_event('customer', action, instance)
    
    from apps.notifications.tasks import send_transactional_email_task
    
    if created:
        create_db_notification(
            org_id=instance.organization_id,
            title="Customer Created",
            message=f"Customer '{instance.contact_name}' has been created.",
            exclude_user=getattr(instance, 'created_by', None)
        )
        
        # Email Customer Onboarding notice
        if instance.email:
            send_transactional_email_task.delay(
                recipient=instance.email,
                subject=f"Customer Profile Registered - {instance.organization.name}",
                template_name="customer_created",
                context_data={
                    "contact_name": instance.contact_name,
                    "org_name": instance.organization.name
                },
                organization_id=str(instance.organization_id)
            )
    else:
        create_db_notification(
            org_id=instance.organization_id,
            title="Customer Updated",
            message=f"Customer '{instance.contact_name}' was updated.",
            exclude_user=getattr(instance, 'updated_by', None)
        )
        
        # Email Customer Update notice
        if instance.email:
            send_transactional_email_task.delay(
                recipient=instance.email,
                subject=f"Customer Profile Updated - {instance.organization.name}",
                template_name="customer_updated",
                context_data={
                    "contact_name": instance.contact_name,
                    "org_name": instance.organization.name
                },
                organization_id=str(instance.organization_id)
            )

@receiver(post_delete, sender=Customer)
def customer_deleted(sender, instance, **kwargs):
    send_sync_event('customer', 'delete', instance)

@receiver(post_save, sender=Invoice)
def invoice_saved(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    send_sync_event('invoice', action, instance)
    
    from apps.notifications.tasks import send_transactional_email_task
    
    if created:
        create_db_notification(
            org_id=instance.organization_id,
            title="Invoice Created",
            message=f"Invoice '{instance.invoice_number}' for ₹ {instance.total_amount} was created.",
            exclude_user=instance.created_by
        )
        
        # Email Draft Invoice Created Alert to admin
        admin_email = instance.organization.email
        if admin_email:
            send_transactional_email_task.delay(
                recipient=admin_email,
                subject=f"Draft Invoice Compiled: {instance.invoice_number} - {instance.organization.name}",
                template_name="invoice_created",
                context_data={
                    "org_name": instance.organization.name,
                    "invoice_number": instance.invoice_number,
                    "customer_name": instance.customer.contact_name,
                    "amount": f"{instance.total_amount:.2f}",
                    "due_date": str(instance.due_date),
                    "invoice_url": f"{settings.FRONTEND_URL}/invoices/{instance.id}"
                },
                organization_id=str(instance.organization_id)
            )
    else:
        title = "Invoice Updated"
        msg = f"Invoice '{instance.invoice_number}' was updated."
        
        if instance.status == 'paid':
            title = "Invoice Paid"
            msg = f"Invoice '{instance.invoice_number}' has been fully paid."
            
            # Send payment confirmation receipt to client
            if instance.customer.email:
                send_transactional_email_task.delay(
                    recipient=instance.customer.email,
                    subject=f"Payment Received - Invoice {instance.invoice_number}",
                    template_name="payment_received",
                    context_data={
                        "customer_name": instance.customer.contact_name,
                        "org_name": instance.organization.name,
                        "invoice_number": instance.invoice_number,
                        "paid_amount": f"{instance.total_amount:.2f}",
                        "remaining_balance": "0.00",
                        "portal_url": f"{settings.FRONTEND_URL}/portal/invoices/{instance.id}"
                    },
                    organization_id=str(instance.organization_id)
                )
            
        create_db_notification(
            org_id=instance.organization_id,
            title=title,
            message=msg,
            exclude_user=getattr(instance, 'updated_by', None)
        )

@receiver(post_delete, sender=Invoice)
def invoice_deleted(sender, instance, **kwargs):
    send_sync_event('invoice', 'delete', instance)

@receiver(post_save, sender=Product)
def product_saved(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    send_sync_event('product', action, instance)
    
    from apps.notifications.tasks import send_transactional_email_task
    admin_email = instance.organization.email
    
    if created:
        # Email Product Created Notice to admin
        if admin_email:
            send_transactional_email_task.delay(
                recipient=admin_email,
                subject=f"Catalog Item Registered: {instance.name}",
                template_name="product_created",
                context_data={
                    "org_name": instance.organization.name,
                    "name": instance.name,
                    "price": f"{instance.price:.2f}",
                    "sku": instance.sku or "N/A"
                },
                organization_id=str(instance.organization_id)
            )
    else:
        create_db_notification(
            org_id=instance.organization_id,
            title="Product Updated",
            message=f"Product '{instance.name}' price updated to ₹ {instance.price}.",
            exclude_user=getattr(instance, 'updated_by', None)
        )

    # Low stock digest will be handled by a daily celery task instead of real-time spam

@receiver(post_delete, sender=Product)
def product_deleted(sender, instance, **kwargs):
    send_sync_event('product', 'delete', instance)

@receiver(post_save, sender=Organization)
def organization_saved(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    send_sync_event('organization', action, instance)
    
    if not created:
        create_db_notification(
            org_id=instance.id,
            title="Organization Updated",
            message="Organization settings were updated.",
            exclude_user=None
        )

@receiver(post_save, sender=UserOrganizationMembership)
def membership_saved(sender, instance, created, **kwargs):
    action = 'create' if created else 'update'
    send_sync_event('membership', action, instance)
    
    from apps.notifications.tasks import send_transactional_email_task
    
    if created:
        create_db_notification(
            org_id=instance.organization_id,
            title="Member Joined",
            message=f"User {instance.user.email} has been added as {instance.get_role_display()}.",
            exclude_user=None
        )
        
        # Email Workspace Invitation / Added notice
        send_transactional_email_task.delay(
            recipient=instance.user.email,
            subject=f"Workspace Invitation to join {instance.organization.name}",
            template_name="organization_invitation",
            context_data={
                "inviter_email": instance.organization.email,
                "org_name": instance.organization.name,
                "role": instance.get_role_display(),
                "invitation_url": f"{settings.FRONTEND_URL}/login"
            },
            organization_id=str(instance.organization_id)
        )
    else:
        # Email Workspace Role Changed Alert
        send_transactional_email_task.delay(
            recipient=instance.user.email,
            subject=f"Workspace Role Changed: {instance.organization.name}",
            template_name="role_changed",
            context_data={
                "org_name": instance.organization.name,
                "role": instance.get_role_display()
            },
            organization_id=str(instance.organization_id)
        )

@receiver(post_delete, sender=UserOrganizationMembership)
def membership_deleted(sender, instance, **kwargs):
    send_sync_event('membership', 'delete', instance)
    
    create_db_notification(
        org_id=instance.organization_id,
        title="Member Removed",
        message=f"User {instance.user.email} was removed from the organization.",
        exclude_user=None
    )
    
    # Email Workspace Removed notice
    from apps.notifications.tasks import send_transactional_email_task
    send_transactional_email_task.delay(
        recipient=instance.user.email,
        subject=f"Workspace Access Revoked: {instance.organization.name}",
        template_name="org_removed",
        context_data={
            "org_name": instance.organization.name
        },
        organization_id=str(instance.organization_id)
    )

def create_db_notification(org_id, title, message, exclude_user=None):
    """Helper to persist database notifications for organization members."""
    try:
        memberships = UserOrganizationMembership.objects.filter(organization_id=org_id)
        if exclude_user:
            memberships = memberships.exclude(user=exclude_user)
            
        notifications_to_create = []
        for m in memberships:
            notifications_to_create.append(
                Notification(
                    organization_id=org_id,
                    user=m.user,
                    title=title,
                    message=message
                )
            )
        if notifications_to_create:
            Notification.objects.bulk_create(notifications_to_create)
            
            # Send real-time notification update event to each member's personal group
            channel_layer = get_channel_layer()
            if channel_layer:
                for n in notifications_to_create:
                    async_to_sync(channel_layer.group_send)(
                        f"user_{n.user.id}",
                        {
                            "type": "send_notification",
                            "data": {
                                "type": "new_notification",
                                "id": str(n.id),
                                "title": n.title,
                                "message": n.message,
                                "created_at": timezone.now().isoformat()
                            }
                        }
                    )
    except Exception as e:
        logger.error(f"Failed to create db notification: {e}")
