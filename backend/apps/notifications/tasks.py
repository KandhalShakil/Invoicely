import base64
import io
import json
import logging
import hashlib
import re
from datetime import timedelta
from decimal import Decimal
from celery import shared_task
from requests.exceptions import RequestException
from smtplib import SMTPException
from django.conf import settings
from django.utils import timezone
from django.template.loader import render_to_string
from django.db import IntegrityError, transaction

from apps.core.context import set_current_organization_id
from apps.notifications.models import EmailSetting, EmailLog, ReminderSchedule
from apps.invoices.models import Invoice, InvoiceWorkflowHistory
from apps.organizations.models import Organization, UserOrganizationMembership
from apps.invoices.services import EmailService, PDFInvoiceGenerator

logger = logging.getLogger(__name__)

@shared_task(
    bind=True,
    autoretry_for=(SMTPException, RequestException),
    max_retries=3,
    default_retry_delay=60
)
def send_transactional_email_task(self, recipient, subject, template_name, context_data, organization_id=None, attachment_base64=None, attachment_filename=None):
    """
    Background worker task to compile and dispatch transactional HTML emails.
    """
    logger.info(f"Starting email dispatch task to {recipient} with template {template_name}")
    
    # Clone the dictionary to prevent caller side-effects (idempotency bug)
    context_data = dict(context_data)
    
    # 1. Organization-level settings gate check
    if organization_id:
        try:
            # Bypass standard tenant filtering to query settings of the targeted org
            setting, _ = EmailSetting.objects.global_all().get_or_create(
                organization_id=organization_id,
                email_type=template_name,
                defaults={'is_enabled': True}
            )
            if not setting.is_enabled:
                logger.info(f"Email type '{template_name}' is disabled for organization {organization_id}. Halting.")
                return "disabled"
        except Exception as e:
            logger.error(f"Error checking email settings gate: {str(e)}", exc_info=True)

    # 2. Idempotency Check to prevent duplicate mail spams
    context_str = json.dumps(context_data, sort_keys=True, default=str)
    raw_str = f"{recipient}:{template_name}:{context_str}"
    idempotency_hash = hashlib.sha256(raw_str.encode('utf-8')).hexdigest()
    
    # Check if a non-failed log already exists
    existing_log = EmailLog.objects.filter(idempotency_hash=idempotency_hash).first()
    if existing_log and existing_log.status != 'failed':
        logger.info(f"Skipping duplicate email dispatch. Idempotency hash: {idempotency_hash}")
        return "duplicate"

    if existing_log:
        log_record = existing_log
        log_record.status = 'pending'
        log_record.error_message = None
        log_record.save()
    else:
        try:
            log_record = EmailLog.objects.create(
                organization_id=organization_id,
                recipient=recipient,
                subject=subject,
                template_name=template_name,
                status='pending',
                idempotency_hash=idempotency_hash,
                context_data=context_data
            )
        except IntegrityError:
            # IntegrityError indicates a concurrent worker already inserted this hash
            logger.warning(f"IntegrityError on creating EmailLog. Assuming duplicate.")
            return "duplicate"

    # 3. Dynamic Template Compile & Render
    try:
        # Standard default fallbacks for general workspace URLs if not defined in context
        context_data.setdefault('login_url', f"{settings.FRONTEND_URL}/login")
        context_data.setdefault('support_url', f"{settings.FRONTEND_URL}/support")
        context_data.setdefault('privacy_url', f"{settings.FRONTEND_URL}/privacy")
        
        html_content = render_to_string(f"emails/{template_name}.html", context_data)
    except Exception as e:
        log_record.status = 'failed'
        log_record.error_message = f"Template rendering failed: {str(e)}"
        log_record.save()
        logger.error(f"Template rendering failed for {template_name}: {str(e)}", exc_info=True)
        return "failed_rendering"

    # 4. Attachment Decoding
    attachment_buffer = None
    if attachment_base64:
        try:
            attachment_bytes = base64.b64decode(attachment_base64)
            attachment_buffer = io.BytesIO(attachment_bytes)
        except Exception as e:
            logger.error(f"Failed decoding base64 attachment: {str(e)}", exc_info=True)

    # 5. Dispatch Delivery via EmailService
    try:
        success = EmailService.send_transactional_email(
            to_email=recipient,
            subject=subject,
            html_content=html_content,
            attachment_buffer=attachment_buffer,
            attachment_filename=attachment_filename
        )
        
        if success:
            log_record.status = 'sent'
            log_record.sent_at = timezone.now()
            log_record.error_message = None
            log_record.save()
            logger.info(f"Email successfully sent to {recipient}")
            return "sent"
        else:
            log_record.status = 'failed'
            log_record.error_message = "SMTP / Brevo API dispatch returned false"
            log_record.save()
            raise Exception("Email dispatch returned false")
            
    except Exception as e:
        log_record.status = 'failed'
        log_record.error_message = f"Dispatch failed: {str(e)}"
        log_record.save()
        logger.error(f"Dispatch failed to {recipient}: {str(e)}")
        # Propagate exception to trigger Celery retry mechanism
        raise e


@shared_task
def run_overdue_and_upcoming_billing_reminders():
    """
    Daily automated scanner for outstanding invoices to trigger upcoming and overdue reminders.
    """
    logger.info("Starting run_overdue_and_upcoming_billing_reminders task")
    today = timezone.now().date()
    
    # Query all active unpaid invoices
    unpaid_statuses = ['sent', 'viewed', 'partially_paid', 'overdue']
    invoices = Invoice.objects.global_all().filter(status__in=unpaid_statuses)
    
    processed_count = 0
    for invoice in invoices:
        try:
            org = invoice.organization
            # Fetch organization specific configuration
            schedule = ReminderSchedule.objects.global_all().filter(organization=org, is_active=True).first()
            
            days_before = [7, 3, 1]
            overdue_interval = 3
            
            if schedule:
                days_before = list(set([7, 3, 1, schedule.days_before_due]))
                overdue_interval = schedule.overdue_interval_days
                
            due_date = invoice.due_date
            days_diff = (due_date - today).days  # Days until due (positive) or overdue (negative)
            
            should_send = False
            is_overdue = False
            days_val = 0
            
            # Case 1: Upcoming Reminders
            if days_diff in days_before:
                should_send = True
                is_overdue = False
                days_val = days_diff
                
            # Case 2: On Due Date
            elif days_diff == 0:
                should_send = True
                is_overdue = False
                days_val = 0
                
            # Case 3: Overdue Reminders
            elif days_diff < 0:
                days_overdue = -days_diff
                # Send warning if matching interval
                if days_overdue % overdue_interval == 0:
                    should_send = True
                    is_overdue = True
                    days_val = days_overdue
                    
            if should_send:
                # Setup tenant context variables
                set_current_organization_id(org.id)
                
                context = {
                    'username': invoice.customer.contact_name,
                    'customer_name': invoice.customer.contact_name,
                    'org_name': org.name,
                    'invoice_number': invoice.invoice_number,
                    'amount': f"{invoice.total_amount:.2f}",
                    'due_date': str(invoice.due_date),
                    'payment_url': f"{settings.FRONTEND_URL}/portal/invoices/{invoice.id}",
                    'is_overdue': is_overdue,
                }
                
                if is_overdue:
                    context['days_overdue'] = days_val
                    subject = f"Urgent: Invoice {invoice.invoice_number} is Overdue - {org.name}"
                else:
                    context['days_until_due'] = days_val
                    subject = f"Upcoming Invoice Due Reminder: Invoice {invoice.invoice_number} - {org.name}"
                
                # Render PDF and attach base64 copy
                pdf_buffer = PDFInvoiceGenerator.generate_pdf(invoice)
                pdf_base64 = base64.b64encode(pdf_buffer.read()).decode('utf-8')
                filename = f"invoice_{invoice.invoice_number.replace('-', '_')}.pdf"
                
                send_transactional_email_task.delay(
                    recipient=invoice.customer.email,
                    subject=subject,
                    template_name='overdue_reminder',
                    context_data=context,
                    organization_id=str(org.id),
                    attachment_base64=pdf_base64,
                    attachment_filename=filename
                )
                processed_count += 1
                
        except Exception as e:
            logger.error(f"Failed processing reminders for invoice {invoice.id}: {str(e)}", exc_info=True)
            
    logger.info(f"Finished overdue and upcoming reminders scanner. Queued {processed_count} emails.")
    return processed_count


@shared_task
def run_periodic_business_summaries(period):
    """
    Compile aggregates of invoicing metrics and email them to tenant workspace admins.
    """
    logger.info(f"Starting run_periodic_business_summaries task for period {period}")
    now = timezone.now()
    
    if period == 'daily':
        start_date = now - timedelta(days=1)
        date_range_str = f"Last 24 Hours ({start_date.strftime('%Y-%m-%d')} to {now.strftime('%Y-%m-%d')})"
    elif period == 'weekly':
        start_date = now - timedelta(days=7)
        date_range_str = f"Last 7 Days ({start_date.strftime('%Y-%m-%d')} to {now.strftime('%Y-%m-%d')})"
    elif period == 'monthly':
        start_date = now - timedelta(days=30)
        date_range_str = f"Last 30 Days ({start_date.strftime('%Y-%m-%d')} to {now.strftime('%Y-%m-%d')})"
    else:
        logger.error(f"Unknown periodic summary type: {period}")
        return 0

    organizations = Organization.objects.all()
    sent_emails = 0
    
    for org in organizations:
        try:
            # Check if this setting is disabled for this organization
            email_type = f"{period}_summary"
            setting = EmailSetting.objects.global_all().filter(organization=org, email_type=email_type).first()
            if setting and not setting.is_enabled:
                logger.info(f"Summary '{email_type}' is disabled for organization {org.name}. Skipping.")
                continue
                
            # Aggregate stats in the timeframe
            invoices = Invoice.objects.global_all().filter(
                organization=org,
                created_at__gte=start_date
            )
            
            drafts_count = invoices.filter(status='draft').count()
            sent_count = invoices.filter(status__in=['sent', 'viewed']).count()
            paid_count = invoices.filter(status='paid').count()
            overdue_count = invoices.filter(status='overdue').count()
            
            total_invoiced = sum(inv.total_amount for inv in invoices.exclude(status='cancelled'))
            
            # Calculate total payments collected in this period
            history = InvoiceWorkflowHistory.objects.filter(
                invoice__organization=org,
                action='record_payment',
                created_at__gte=start_date
            )
            total_paid = Decimal('0.00')
            for record in history:
                match = re.search(r'Payment of \w+ ([\d\.]+) recorded', record.comment or '')
                if match:
                    total_paid += Decimal(match.group(1))
                    
            # Identify administrators & owners of this workspace
            memberships = UserOrganizationMembership.objects.filter(
                organization=org,
                role__in=['owner', 'admin']
            )
            
            for mem in memberships:
                recipient = mem.user.email
                context = {
                    'period': period.capitalize(),
                    'date_range': date_range_str,
                    'org_name': org.name,
                    'total_invoiced': f"{total_invoiced:.2f}",
                    'total_paid': f"{total_paid:.2f}",
                    'drafts_count': drafts_count,
                    'sent_count': sent_count,
                    'paid_count': paid_count,
                    'overdue_count': overdue_count,
                    'dashboard_url': f"{settings.FRONTEND_URL}/settings",
                    'support_url': f"{settings.FRONTEND_URL}/support",
                    'privacy_url': f"{settings.FRONTEND_URL}/privacy",
                }
                
                send_transactional_email_task.delay(
                    recipient=recipient,
                    subject=f"{period.capitalize()} Invoicing Summary - {org.name}",
                    template_name='business_summary',
                    context_data=context,
                    organization_id=str(org.id)
                )
                sent_emails += 1
                
        except Exception as e:
            logger.error(f"Failed to generate summary for organization {org.name}: {str(e)}", exc_info=True)
            
    logger.info(f"Finished run_periodic_business_summaries task. Sent {sent_emails} summary emails.")
    return sent_emails

@shared_task
def send_daily_low_stock_digest():
    """
    Scan all physical products and send a consolidated email to organization admins for any low or out-of-stock items.
    Tracks sent emails in EmailAlertLog to avoid duplicates on the same day.
    """
    from apps.products.models import Product
    from apps.notifications.models import EmailAlertLog
    
    logger.info("Starting send_daily_low_stock_digest task")
    today = timezone.now().date()
    
    orgs = Organization.objects.all()
    emails_sent = 0
    
    for org in orgs:
        # Check if they have an admin email
        if not org.email:
            continue
            
        low_stock_products = Product.objects.global_all().filter(
            organization=org,
            type='product',
            inventory_count__lte=5
        ).order_by('inventory_count')
        
        if not low_stock_products.exists():
            continue
            
        # Filter products that haven't triggered an alert today
        products_to_alert = []
        for p in low_stock_products:
            alert_type = 'out_of_stock' if p.inventory_count <= 0 else 'low_stock'
            if not EmailAlertLog.objects.filter(
                organization=org,
                alert_type=alert_type,
                target_id=p.id,
                created_date=today
            ).exists():
                products_to_alert.append((p, alert_type))
                
        if not products_to_alert:
            continue
            
        context_items = []
        logs_to_create = []
        
        for p, alert_type in products_to_alert:
            context_items.append({
                'name': p.name,
                'sku': p.sku or 'N/A',
                'inventory_count': p.inventory_count,
                'status': 'Out of Stock' if p.inventory_count <= 0 else 'Low Stock'
            })
            logs_to_create.append(EmailAlertLog(
                organization=org,
                alert_type=alert_type,
                target_id=p.id,
                created_date=today
            ))
            
        # Send one digest email per organization
        context = {
            'org_name': org.name,
            'items': context_items,
            'dashboard_url': f"{settings.FRONTEND_URL}/products"
        }
        
        send_transactional_email_task.delay(
            recipient=org.email,
            subject=f"Daily Inventory Alert - {org.name}",
            template_name='daily_low_stock_digest',
            context_data=context,
            organization_id=str(org.id)
        )
        emails_sent += 1
        
        # Record logs so we don't spam again today
        EmailAlertLog.objects.bulk_create(logs_to_create)
        
    logger.info(f"Finished send_daily_low_stock_digest. Sent digests to {emails_sent} organizations.")
    return emails_sent

