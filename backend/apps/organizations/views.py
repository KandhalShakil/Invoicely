from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Organization, UserOrganizationMembership
from .serializers import (
    OrganizationSerializer, UserOrganizationMembershipSerializer, AddMemberSerializer
)
from .permissions import HasRolePermission
from .utils import is_valid_upi, extract_upi_details_from_string, decode_qr_image, generate_upi_qr

class OrganizationViewSet(viewsets.ModelViewSet):
    serializer_class = OrganizationSerializer
    permission_classes = [permissions.IsAuthenticated, HasRolePermission]
    
    required_permissions = {
        'list': None, # Any authenticated user can list the organizations they belong to
        'retrieve': 'view_reports',
        'create': None, # Authenticated user can create new organization
        'update': 'manage_settings',
        'partial_update': 'manage_settings',
        'destroy': 'manage_settings',
        'add_member': 'manage_users',
        'remove_member': 'manage_users',
        'list_members': 'view_reports',
        'pending_members': 'manage_users',
        'resolve_member': 'manage_users'
    }

    def get_queryset(self):
        # Users can only view/manage organizations they are members of
        return Organization.objects.filter(members__user=self.request.user)

    def perform_create(self, serializer):
        # Make the creator the default owner of the organization
        org = serializer.save(created_by=self.request.user)
        UserOrganizationMembership.objects.create(
            user=self.request.user,
            organization=org,
            role='owner'
        )

    @action(detail=False, methods=['get'], permission_classes=[permissions.AllowAny], url_path='check')
    def check(self, request):
        name = request.query_params.get('name', '')
        if not name or not name.strip():
            return Response({'exists': False}, status=status.HTTP_200_OK)
        
        exists = Organization.objects.filter(name__iexact=name.strip()).exists()
        return Response({'exists': exists}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='members')
    def list_members(self, request, pk=None):
        org = self.get_object()
        memberships = UserOrganizationMembership.objects.filter(organization=org, approval_status='approved')
        serializer = UserOrganizationMembershipSerializer(memberships, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='members/add')
    def add_member(self, request, pk=None):
        org = self.get_object()
        serializer = AddMemberSerializer(data=request.data, context={'organization_id': org.id})
        if serializer.is_valid():
            membership = serializer.save()
            return Response(
                UserOrganizationMembershipSerializer(membership).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='members/remove')
    def remove_member(self, request, pk=None):
        org = self.get_object()
        user_id = request.data.get('user_id')
        if not user_id:
            return Response({'error': 'user_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            membership = UserOrganizationMembership.objects.get(
                organization=org,
                user_id=user_id
            )
            # Prevent self-removal of the organization owner
            if membership.role == 'owner' and org.created_by_id == membership.user_id:
                return Response({'error': 'Cannot remove the primary organization owner.'}, status=status.HTTP_400_BAD_REQUEST)
                
            membership.delete()
            return Response({'message': 'Member removed successfully.'}, status=status.HTTP_200_OK)
        except UserOrganizationMembership.DoesNotExist:
            return Response({'error': 'Member not found.'}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['get'], url_path='pending_members')
    def pending_members(self, request, pk=None):
        org = self.get_object()
        memberships = UserOrganizationMembership.objects.filter(organization=org, approval_status='pending')
        serializer = UserOrganizationMembershipSerializer(memberships, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='resolve_member')
    def resolve_member(self, request, pk=None):
        org = self.get_object()
        action_type = request.data.get('action')  # 'approve' or 'reject'
        user_id = request.data.get('user_id')
        
        if not user_id:
            return Response({'error': 'user_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        
        if action_type not in ['approve', 'reject']:
            return Response({'error': 'Invalid action. Must be approve or reject.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            membership = UserOrganizationMembership.objects.get(organization=org, user_id=user_id, approval_status='pending')
        except UserOrganizationMembership.DoesNotExist:
            return Response({'error': 'Pending membership not found.'}, status=status.HTTP_404_NOT_FOUND)
            
        from apps.audit_logs.models import AuditLog
        from apps.notifications.models import Notification
        from channels.layers import get_channel_layer
        from asgiref.sync import async_to_sync
        
        if action_type == 'approve':
            membership.approval_status = 'approved'
            membership.save(update_fields=['approval_status'])
            msg = "Your account has been approved. You may now log in."
        else:
            membership.approval_status = 'rejected'
            membership.save(update_fields=['approval_status'])
            msg = "Your registration request has been rejected."
        
        try:
            AuditLog.unscoped.create(
                organization_id=org.id,
                user=request.user,
                action=f"{action_type.capitalize()} Registration",
                entity_name='UserOrganizationMembership',
                entity_id=membership.id,
                new_state={'approval_status': membership.approval_status, 'role': membership.role}
            )
        except Exception:
            pass  # Don't fail the request if audit log fails
        
        notification = Notification.objects.create(
            organization_id=org.id,
            user=membership.user,
            title="Registration Update",
            message=msg
        )
        
        channel_layer = get_channel_layer()
        if channel_layer:
            try:
                async_to_sync(channel_layer.group_send)(
                    f"user_{membership.user.id}",
                    {
                        "type": "send_notification",
                        "data": {
                            "type": "new_notification",
                            "id": str(notification.id),
                            "title": notification.title,
                            "message": notification.message,
                            "created_at": notification.created_at.isoformat()
                        }
                    }
                )
            except Exception:
                pass  # Don't fail if WebSocket push fails

        # Optional transactional email (respects org email settings)
        try:
            from apps.notifications.tasks import send_transactional_email_task
            from django.conf import settings as django_settings
            username = membership.user.first_name or membership.user.email.split('@')[0]
            if action_type == 'approve':
                send_transactional_email_task.delay(
                    recipient=membership.user.email,
                    subject=f"Your Account Has Been Approved - {org.name}",
                    template_name="account_approved",
                    context_data={
                        "username": username,
                        "org_name": org.name,
                        "role": membership.role,
                        "login_url": f"{django_settings.FRONTEND_URL}/login",
                    },
                    organization_id=str(org.id)
                )
            else:
                send_transactional_email_task.delay(
                    recipient=membership.user.email,
                    subject=f"Registration Update - {org.name}",
                    template_name="account_rejected",
                    context_data={
                        "username": username,
                        "org_name": org.name,
                        "role": membership.role,
                        "register_url": f"{django_settings.FRONTEND_URL}/register",
                    },
                    organization_id=str(org.id)
                )
        except Exception:
            pass  # Email failure must not block the approval action
            
        return Response({'message': f'User successfully {action_type}d.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='payment-setup/upi')
    def setup_payment_upi(self, request, pk=None):
        org = self.get_object()
        upi_id = request.data.get('upi_id')
        merchant_name = request.data.get('merchant_name') or org.name
        
        if not is_valid_upi(upi_id):
            return Response({'error': 'Invalid UPI ID format.'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # Generate clean QR code
            qr_file = generate_upi_qr(upi_id, merchant_name)
            
            org.payment_upi_id = upi_id
            org.payment_merchant_name = merchant_name
            # If an old QR code exists, replace it
            if org.payment_qr_code:
                org.payment_qr_code.delete(save=False)
            org.payment_qr_code.save(qr_file.name, qr_file, save=True)
            
            return Response({
                'message': 'Payment UPI configured successfully.',
                'payment_upi_id': org.payment_upi_id,
                'payment_merchant_name': org.payment_merchant_name,
                'payment_qr_code': org.payment_qr_code.url
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='payment-setup/qr')
    def setup_payment_qr(self, request, pk=None):
        org = self.get_object()
        qr_image = request.FILES.get('qr_image')
        
        if not qr_image:
            return Response({'error': 'No QR image provided.'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Decode the image
        decoded_string = decode_qr_image(qr_image)
        if not decoded_string:
            return Response({'error': 'Could not decode QR code. Please upload a clear image of a valid UPI QR.'}, status=status.HTTP_400_BAD_REQUEST)
            
        # Extract details
        details = extract_upi_details_from_string(decoded_string)
        if not details:
            return Response({'error': 'The uploaded QR code is not a standard UPI payment QR.'}, status=status.HTTP_400_BAD_REQUEST)
            
        upi_id = details['upi_id']
        merchant_name = details['merchant_name'] or org.name
        
        try:
            # Generate fresh QR code from extracted details
            qr_file = generate_upi_qr(upi_id, merchant_name)
            
            org.payment_upi_id = upi_id
            org.payment_merchant_name = merchant_name
            if org.payment_qr_code:
                org.payment_qr_code.delete(save=False)
            org.payment_qr_code.save(qr_file.name, qr_file, save=True)
            
            return Response({
                'message': 'QR Code processed and UPI configured successfully.',
                'extracted_upi': upi_id,
                'extracted_merchant': merchant_name,
                'payment_qr_code': org.payment_qr_code.url
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
