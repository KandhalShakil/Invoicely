import io
import base64
import qrcode
import requests
import logging
from django.conf import settings
from django.core.mail import send_mail
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

logger = logging.getLogger(__name__)

class PDFInvoiceGenerator:
    @staticmethod
    def generate_pdf(invoice):
        """
        Generates a beautiful enterprise-grade PDF invoice using ReportLab.
        Returns a BytesIO buffer.
        """
        buffer = io.BytesIO()
        
        # Page Setup
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36
        )
        
        story = []
        styles = getSampleStyleSheet()
        
        # Color Palette
        primary_color = colors.HexColor('#0f172a')   # Dark Slate
        secondary_color = colors.HexColor('#475569') # Slate Gray
        accent_color = colors.HexColor('#059669')    # Emerald Green
        light_bg = colors.HexColor('#f8fafc')        # Very Light Gray
        border_color = colors.HexColor('#cbd5e1')    # Light Slate Border
        
        # Typography Styles
        title_style = ParagraphStyle(
            'InvoiceTitle',
            parent=styles['Heading1'],
            fontName='Helvetica-Bold',
            fontSize=24,
            leading=28,
            textColor=primary_color
        )
        
        meta_label_style = ParagraphStyle(
            'MetaLabel',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=12,
            textColor=secondary_color
        )
        
        meta_value_style = ParagraphStyle(
            'MetaValue',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=10,
            leading=12,
            textColor=primary_color
        )
        
        section_heading_style = ParagraphStyle(
            'SectionHeading',
            parent=styles['Heading3'],
            fontName='Helvetica-Bold',
            fontSize=12,
            leading=14,
            textColor=primary_color
        )
        
        normal_style = ParagraphStyle(
            'BodyNormal',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=12,
            textColor=primary_color
        )
        
        table_header_style = ParagraphStyle(
            'TableHeader',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            leading=11,
            textColor=colors.white
        )

        table_body_style = ParagraphStyle(
            'TableBody',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=9,
            leading=11,
            textColor=primary_color
        )

        # 1. Header (Logo + Company metadata)
        company_org = invoice.organization
        org_name = company_org.name
        org_email = company_org.email
        org_phone = company_org.phone or ''
        org_gst = company_org.tax_number or 'N/A'
        
        logo_url = company_org.logo_url
        logo_widget = None
        if logo_url and logo_url.startswith('http'):
            try:
                # Fetch logo from web
                res = requests.get(logo_url, timeout=5)
                if res.status_code == 200:
                    logo_data = io.BytesIO(res.content)
                    logo_widget = Image(logo_data, width=1.2*inch, height=0.6*inch)
            except Exception:
                pass
                
        if not logo_widget:
            # Fallback simple text paragraph representing company name
            logo_widget = Paragraph(f"<b>{org_name}</b>", ParagraphStyle('LogoFallback', fontName='Helvetica-Bold', fontSize=18, textColor=accent_color))

        header_data = [
            [logo_widget, Paragraph("<b>INVOICE</b>", title_style)]
        ]
        
        header_table = Table(header_data, colWidths=[4.0*inch, 3.5*inch])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('ALIGN', (1,0), (1,0), 'RIGHT'),
        ]))
        
        story.append(header_table)
        story.append(Spacer(1, 15))
        
        # 2. Company Meta & Billing details
        company_address = company_org.billing_address
        comp_street = company_address.get('street', '')
        comp_city = company_address.get('city', '')
        comp_state = company_address.get('state', '')
        comp_country = company_address.get('country', '')
        comp_zip = company_address.get('zip', '')
        
        org_address_str = f"{comp_street}<br/>{comp_city}, {comp_state} {comp_zip}<br/>{comp_country}"
        
        cust = invoice.customer
        cust_address = cust.billing_address
        cust_street = cust_address.get('street', '')
        cust_city = cust_address.get('city', '')
        cust_state = cust_address.get('state', '')
        cust_country = cust_address.get('country', '')
        cust_zip = cust_address.get('zip', '')
        
        cust_address_str = f"{cust_street}<br/>{cust_city}, {cust_state} {cust_zip}<br/>{cust_country}"
        
        info_data = [
            [
                Paragraph("<b>From:</b>", section_heading_style), 
                Paragraph("<b>To:</b>", section_heading_style), 
                Paragraph("<b>Details:</b>", section_heading_style)
            ],
            [
                Paragraph(f"<b>{org_name}</b><br/>{org_address_str}<br/>GSTIN: {org_gst}<br/>Email: {org_email}", normal_style),
                Paragraph(f"<b>{cust.contact_name}</b><br/>{cust_address_str}<br/>Email: {cust.email}", normal_style),
                Table([
                    [Paragraph("Invoice No:", meta_label_style), Paragraph(invoice.invoice_number, meta_value_style)],
                    [Paragraph("Issue Date:", meta_label_style), Paragraph(str(invoice.issue_date), meta_value_style)],
                    [Paragraph("Due Date:", meta_label_style), Paragraph(str(invoice.due_date), meta_value_style)],
                    [Paragraph("Status:", meta_label_style), Paragraph(f"<b>{invoice.get_status_display()}</b>", ParagraphStyle('StatusStyle', parent=meta_value_style, textColor=accent_color if invoice.status == 'paid' else primary_color))],
                ], colWidths=[1.1*inch, 1.3*inch], style=[('VALIGN', (0,0), (-1,-1), 'TOP'), ('BOTTOMPADDING', (0,0), (-1,-1), 2), ('TOPPADDING', (0,0), (-1,-1), 2)])
            ]
        ]
        
        info_table = Table(info_data, colWidths=[2.5*inch, 2.5*inch, 2.5*inch])
        info_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('TOPPADDING', (0,0), (-1,-1), 4),
        ]))
        
        story.append(info_table)
        story.append(Spacer(1, 20))
        
        # 3. Line Items Table
        line_headers = [
            Paragraph("Item & Description", table_header_style),
            Paragraph("Qty", table_header_style),
            Paragraph("Unit Price", table_header_style),
            Paragraph("Tax Rate", table_header_style),
            Paragraph("Amount", table_header_style)
        ]
        
        table_rows = [line_headers]
        
        for item in invoice.line_items.all():
            table_rows.append([
                Paragraph(f"<b>{item.product.name}</b><br/><font color='#475569'>{item.description or ''}</font>", table_body_style),
                Paragraph(f"{item.quantity:.2f}", table_body_style),
                Paragraph(f"{invoice.currency} {item.unit_price:.2f}", table_body_style),
                Paragraph(f"{item.tax_rate:.1f}%", table_body_style),
                Paragraph(f"{invoice.currency} {item.total_amount:.2f}", table_body_style)
            ])
            
        line_table = Table(table_rows, colWidths=[3.2*inch, 0.8*inch, 1.2*inch, 0.9*inch, 1.4*inch])
        
        # Table styling
        line_table_style = TableStyle([
            ('BACKGROUND', (0,0), (-1,0), primary_color),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('BOTTOMPADDING', (0,0), (-1,-1), 8),
            ('TOPPADDING', (0,0), (-1,-1), 8),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, light_bg]),
            ('LINEBELOW', (0,-1), (-1,-1), 1.5, primary_color),
        ])
        
        line_table.setStyle(line_table_style)
        story.append(line_table)
        story.append(Spacer(1, 15))
        
        # 4. Total and Payments Summary + UPI QR Code
        qr_pdf_image = None
        if company_org.payment_upi_id:
            try:
                merchant_name = company_org.payment_merchant_name or org_name
                # Dynamic QR with exact amount and invoice number
                qr_payload = f"upi://pay?pa={company_org.payment_upi_id}&pn={merchant_name.replace(' ', '%20')}&am={invoice.total_amount}&cu={invoice.currency}&tn={invoice.invoice_number}"
                qr = qrcode.QRCode(version=1, box_size=3, border=1)
                qr.add_data(qr_payload)
                qr.make(fit=True)
                qr_img = qr.make_image(fill_color="black", back_color="white")
                
                qr_buffer = io.BytesIO()
                qr_img.save(qr_buffer, format="PNG")
                qr_buffer.seek(0)
                
                # Combine Image and UPI text vertically
                qr_pdf_image = Table([
                    [Paragraph("<b>SCAN TO PAY</b>", ParagraphStyle('ScanHeader', parent=meta_label_style, alignment=1, textColor=accent_color))],
                    [Image(qr_buffer, width=1.1*inch, height=1.1*inch)],
                    [Paragraph(f"UPI: {company_org.payment_upi_id}", ParagraphStyle('UpiText', parent=normal_style, alignment=1, fontSize=8, textColor=secondary_color))]
                ], colWidths=[1.5*inch], style=[('ALIGN', (0,0), (-1,-1), 'CENTER'), ('VALIGN', (0,0), (-1,-1), 'MIDDLE')])
            except Exception as e:
                logger.error(f"Failed to render QR for PDF: {e}")
                qr_pdf_image = Paragraph("", normal_style)
        else:
            qr_pdf_image = Paragraph("", normal_style)

        totals_data = [
            [
                qr_pdf_image,
                Table([
                    [Paragraph("Subtotal:", meta_label_style), Paragraph(f"{invoice.currency} {invoice.subtotal:.2f}", meta_value_style)],
                    [Paragraph("GST / Taxes:", meta_label_style), Paragraph(f"{invoice.currency} {invoice.tax_amount:.2f}", meta_value_style)],
                    [Paragraph("Discounts:", meta_label_style), Paragraph(f"{invoice.currency} -{invoice.discount_amount:.2f}", meta_value_style)],
                    [Paragraph("Total Amount Due:", ParagraphStyle('TotalLabel', parent=meta_label_style, fontSize=11, textColor=accent_color)), Paragraph(f"<b>{invoice.currency} {invoice.total_amount:.2f}</b>", ParagraphStyle('TotalVal', parent=meta_value_style, fontSize=11, textColor=accent_color))],
                ], colWidths=[1.5*inch, 1.5*inch], style=[('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('ALIGN', (1,0), (1,-1), 'RIGHT'), ('TOPPADDING', (0,0), (-1,-1), 3), ('BOTTOMPADDING', (0,0), (-1,-1), 3)])
            ]
        ]
        
        totals_table = Table(totals_data, colWidths=[3.5*inch, 4.0*inch])
        totals_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('ALIGN', (0,0), (0,0), 'LEFT'),
            ('ALIGN', (1,0), (1,0), 'RIGHT'),
        ]))
        
        story.append(totals_table)
        story.append(Spacer(1, 30))
        
        # 5. Terms / Signatures / Notes
        terms_style = ParagraphStyle(
            'TermsText',
            parent=styles['Normal'],
            fontName='Helvetica-Oblique',
            fontSize=8,
            leading=10,
            textColor=secondary_color
        )
        
        bottom_data = [
            [
                Paragraph(f"<b>Terms & Conditions:</b><br/>{invoice.terms or 'Payment is due upon receipt of invoice.'}", terms_style),
                Paragraph("Authorized Signature<br/><br/>________________________", ParagraphStyle('SigStyle', parent=normal_style, alignment=2, fontName='Helvetica-Bold'))
            ]
        ]
        
        bottom_table = Table(bottom_data, colWidths=[4.5*inch, 3.0*inch])
        bottom_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ]))
        
        story.append(bottom_table)
        
        # Build Document
        doc.build(story)
        buffer.seek(0)
        return buffer


class EmailService:
    @staticmethod
    def send_transactional_email(to_email, subject, html_content, attachment_buffer=None, attachment_filename=None):
        """
        Dispatches emails via Brevo REST API, falling back to Django SMTP/Console log.
        """
        api_key = settings.BREVO_API_KEY
        sender_email = settings.BREVO_SENDER_EMAIL
        sender_name = settings.BREVO_SENDER_NAME

        # If Brevo is configured, call API
        if api_key:
            url = "https://api.brevo.com/v3/smtp/email"
            headers = {
                "api-key": api_key,
                "Content-Type": "application/json",
                "accept": "application/json"
            }
            
            payload = {
                "sender": {"name": sender_name, "email": sender_email},
                "to": [{"email": to_email}],
                "subject": subject,
                "htmlContent": html_content
            }
            
            if attachment_buffer and attachment_filename:
                # Brevo expects base64 encoded attachment content
                attachment_buffer.seek(0)
                b64_content = base64.b64encode(attachment_buffer.read()).decode('utf-8')
                payload["attachments"] = [
                    {
                        "name": attachment_filename,
                        "content": b64_content
                    }
                ]
                
            try:
                res = requests.post(url, json=payload, headers=headers, timeout=10)
                if res.status_code in [200, 201, 202]:
                    logger.info(f"Email sent successfully via Brevo to {to_email}")
                    return True
                else:
                    logger.error(f"Failed to send email via Brevo. Status: {res.status_code}, Response: {res.text}")
            except Exception as e:
                logger.error(f"Brevo API error: {str(e)}")

        # Fallback: Django send_mail (console/SMTP backend)
        try:
            logger.info(f"Sending fallback email to {to_email}")
            # simple email dispatch (without attachment on simple console wrapper)
            send_mail(
                subject=subject,
                message="",
                html_message=html_content,
                from_email=f"{sender_name} <{sender_email}>",
                recipient_list=[to_email],
                fail_silently=False,
            )
            return True
        except Exception as e:
            logger.error(f"Django local email fallback failed: {str(e)}")
            return False
