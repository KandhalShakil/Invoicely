from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from apps.core.fast_crud import fast_crud_router

urlpatterns = [
    path('admin/', admin.site.urls),
    
    # API endpoints
    path('api/v1/auth/', include('apps.authentication.urls')),
    path('api/v1/organizations/', include('apps.organizations.urls')),
    path('api/v1/customers/', include('apps.customers.urls')),
    path('api/v1/products/', include('apps.products.urls')),
    path('api/v1/invoices/', include('apps.invoices.urls')),
    path('api/v1/notifications/', include('apps.notifications.urls')),
    path('api/v1/audit-logs/', include('apps.audit_logs.urls')),
    path('api/v1/ai/', include('apps.ai.urls')),
    path('api/v1/crud/', include(fast_crud_router.urls)),
    
    # API Schema and Documentation
    path('api/v1/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/v1/schema/swagger-ui/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/v1/schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
