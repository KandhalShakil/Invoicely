import io
import re
from PIL import Image
import qrcode
from pyzbar.pyzbar import decode
from django.core.files.base import ContentFile

def is_valid_upi(upi_string):
    """
    Validates a raw UPI ID string (e.g. shop@paytm)
    """
    if not upi_string or " " in upi_string:
        return False
    # Basic regex for UPI ID (alphanumeric, dot, hyphen before @ and alphanumeric after @)
    pattern = r'^[a-zA-Z0-9.\-_]+@[a-zA-Z0-9]+$'
    return bool(re.match(pattern, upi_string))


def extract_upi_details_from_string(payment_string):
    """
    Extracts pa (UPI ID) and pn (Merchant Name) from a UPI intent URI.
    Example: upi://pay?pa=shop@paytm&pn=ABC Store
    Returns: dict with 'upi_id' and 'merchant_name' or None
    """
    if not payment_string.startswith("upi://pay"):
        # Not a valid UPI intent string
        return None
    
    upi_id = None
    merchant_name = None
    
    # Very basic parsing
    query_parts = payment_string.replace("upi://pay?", "").split("&")
    for part in query_parts:
        if part.startswith("pa="):
            upi_id = part.replace("pa=", "")
        elif part.startswith("pn="):
            merchant_name = part.replace("pn=", "").replace("%20", " ")
            
    if upi_id and is_valid_upi(upi_id):
        return {
            'upi_id': upi_id,
            'merchant_name': merchant_name
        }
    return None

def decode_qr_image(image_file):
    """
    Reads an uploaded image file, decodes the QR code, and extracts the UPI string.
    Returns: The extracted text string, or None if no QR found.
    """
    try:
        img = Image.open(image_file)
        decoded_objects = decode(img)
        if decoded_objects:
            # Assuming the first QR code found is the relevant one
            return decoded_objects[0].data.decode('utf-8')
    except Exception as e:
        print(f"QR Decode Error: {e}")
        pass
    return None


def generate_upi_qr(upi_id, merchant_name=None):
    """
    Generates a clean QR code image from a given UPI ID.
    Returns a Django ContentFile that can be saved directly to an ImageField.
    """
    # Construct standard UPI Intent URI
    # upi://pay?pa=<payee_vpa>&pn=<payee_name>
    uri = f"upi://pay?pa={upi_id}"
    if merchant_name:
        uri += f"&pn={merchant_name.replace(' ', '%20')}"
        
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=10,
        border=4,
    )
    qr.add_data(uri)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    
    # Save to memory buffer
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    
    # Return as ContentFile
    filename = f"qr_{upi_id.replace('@', '_')}.png"
    return ContentFile(buffer.getvalue(), name=filename)

