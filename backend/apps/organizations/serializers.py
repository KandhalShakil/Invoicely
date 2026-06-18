from rest_framework import serializers
from .models import Organization, UserOrganizationMembership
from django.contrib.auth import get_user_model
from apps.authentication.serializers import UserSerializer

User = get_user_model()

class OrganizationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organization
        fields = ('id', 'name', 'tax_number', 'email', 'phone', 'currency', 'logo_url', 'billing_address', 'payment_upi_id', 'payment_merchant_name', 'payment_qr_code', 'created_at')
        read_only_fields = ('id', 'created_at', 'payment_qr_code')

    def validate_name(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError("Organization name is required.")
        queryset = Organization.objects.filter(name__iexact=value.strip())
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("Organization name already exists.")
        return value.strip()



class UserOrganizationMembershipSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    
    class Meta:
        model = UserOrganizationMembership
        fields = ('id', 'user', 'role', 'approval_status', 'created_at')
        read_only_fields = ('id', 'created_at', 'user', 'approval_status')


class AddMemberSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    role = serializers.ChoiceField(choices=UserOrganizationMembership.ROLE_CHOICES, default='viewer')

    def validate_email(self, value):
        # Verify user exists or needs to be registered
        if not User.objects.filter(email=value).exists():
            raise serializers.ValidationError("User with this email does not exist. They must register first.")
        return value

    def create(self, validated_data):
        org_id = self.context['organization_id']
        email = validated_data['email']
        role = validated_data['role']
        
        user = User.objects.get(email=email)
        
        # Check if already a member
        membership, created = UserOrganizationMembership.objects.get_or_create(
            user=user,
            organization_id=org_id,
            defaults={'role': role}
        )
        
        if not created:
            # Update role and ensure they are approved if they were previously rejected
            membership.role = role
            membership.approval_status = 'approved'
            membership.save(update_fields=['role', 'approval_status'])
            
        return membership
