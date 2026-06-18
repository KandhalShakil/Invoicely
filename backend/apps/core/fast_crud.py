from django.apps import apps
from rest_framework import serializers, viewsets, routers
from rest_framework.permissions import IsAuthenticated

# Initialize a default router for the fast CRUD endpoints
fast_crud_router = routers.DefaultRouter()

# Iterate through all installed Django models
for model in apps.get_models():
    # Skip abstract models and proxy models
    if model._meta.abstract or model._meta.proxy:
        continue

    # Dynamically generate a ModelSerializer class
    class DynamicMeta:
        pass
    
    setattr(DynamicMeta, 'model', model)
    setattr(DynamicMeta, 'fields', '__all__')

    serializer_class_name = f"{model.__name__}FastSerializer"
    serializer_class = type(
        serializer_class_name,
        (serializers.ModelSerializer,),
        {'Meta': DynamicMeta}
    )

    # Dynamically generate a ModelViewSet class
    viewset_class_name = f"{model.__name__}FastViewSet"
    viewset_class = type(
        viewset_class_name,
        (viewsets.ModelViewSet,),
        {
            'queryset': model.objects.all(),
            'serializer_class': serializer_class,
            'permission_classes': [IsAuthenticated],  # Require authentication by default
        }
    )

    # Register the dynamically created ViewSet to the router
    # URL pattern: <app_label>/<model_name>/
    # E.g., /api/v1/crud/invoices/invoice/
    route_name = f"{model._meta.app_label}/{model._meta.model_name}"
    fast_crud_router.register(route_name, viewset_class, basename=f"fast-crud-{model._meta.app_label}-{model._meta.model_name}")
