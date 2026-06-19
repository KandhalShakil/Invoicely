import os
from datetime import timedelta
from pathlib import Path
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env file
load_dotenv(BASE_DIR / '.env')

DEBUG = os.getenv('DJANGO_DEBUG', 'True').lower() == 'true'

# SECRET_KEY must always be set from environment in production.
_default_secret = 'django-insecure-dev-only-key-change-in-production-2026' if DEBUG else ''
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', _default_secret)
if not SECRET_KEY:
    raise RuntimeError('DJANGO_SECRET_KEY environment variable is not set. Refusing to start in production mode.')

ALLOWED_HOSTS = os.getenv(
    "ALLOWED_HOSTS",
    "localhost,127.0.0.1,invoice-management-system-nhs5.onrender.com"
).split(",")

# Application definition
INSTALLED_APPS = [
    # ASGI support
    'daphne',
    
    # Core Django apps
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Third party packages
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'drf_spectacular',
    'axes',  # Account lockout / brute-force protection
    
    # Custom SaaS Apps
    'apps.core',
    'apps.authentication',
    'apps.organizations',
    'apps.customers',
    'apps.products',
    'apps.invoices',
    'apps.notifications',
    'apps.audit_logs',
    'apps.ai',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    # Axes must be after AuthenticationMiddleware
    'axes.middleware.AxesMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    # Custom Multi-Tenant Isolation Middleware
    'apps.core.middleware.TenantMiddleware',
    # Custom Audit Log Middleware
    'apps.audit_logs.middleware.AuditLogMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# Database Setup (PostgreSQL with fallback to SQLite for local development/testing)
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

POSTGRES_DB = os.getenv('POSTGRES_DB')
POSTGRES_USER = os.getenv('POSTGRES_USER')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD')
POSTGRES_HOST = os.getenv('POSTGRES_HOST')
POSTGRES_PORT = os.getenv('POSTGRES_PORT', '5432')
POSTGRES_SSLMODE = os.getenv('POSTGRES_SSLMODE', 'prefer')

import sys
IS_TESTING = 'test' in sys.argv or any('pytest' in arg for arg in sys.argv) or 'pytest' in sys.modules

if all([POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_HOST]) and not IS_TESTING:
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': POSTGRES_DB,
        'USER': POSTGRES_USER,
        'PASSWORD': POSTGRES_PASSWORD,
        'HOST': POSTGRES_HOST,
        'PORT': POSTGRES_PORT,
        'CONN_MAX_AGE': 60,  # Persistent connections — reuse DB connections for 60s
        'OPTIONS': {
            'connect_timeout': 10,
            'sslmode': POSTGRES_SSLMODE,
        },
    }

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Custom User Model
AUTH_USER_MODEL = 'authentication.User'

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# File Upload / AWS S3 Config
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_STORAGE_BUCKET_NAME = os.getenv('AWS_STORAGE_BUCKET_NAME')
AWS_S3_REGION_NAME = os.getenv('AWS_S3_REGION_NAME', 'us-east-1')

# REST Framework configurations
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.OptionalPageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    # Enterprise Rate Limiting
    'DEFAULT_THROTTLE_CLASSES': [
        'apps.core.throttling.BurstRateThrottle',
        'apps.core.throttling.SustainedRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'burst': '60/min',
        'sustained': '1000/day',
        'login': '10/min',
        'register': '5/hour',
        'anon': '30/min',
    },
    'EXCEPTION_HANDLER': 'apps.core.exceptions.custom_exception_handler',
}

# SimpleJWT Settings
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# WebSockets, Caching, and Celery Broker Settings
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'invoice-locmem-fallback',
    }
}

CELERY_TASK_ALWAYS_EAGER = True
CELERY_BROKER_URL = 'memory://'
CELERY_RESULT_BACKEND = 'cache+memory://'

# General Celery Task Serialization Config
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'
CELERY_BEAT_SCHEDULE = {
    'generate-recurring-invoices-daily': {
        'task': 'apps.invoices.tasks.generate_recurring_invoices',
        'schedule': timedelta(hours=24),
    },
    'check-overdue-invoices-daily': {
        'task': 'apps.invoices.tasks.check_overdue_invoices',
        'schedule': timedelta(hours=24),
    },
    'scan-invoice-billing-reminders-daily': {
        'task': 'apps.notifications.tasks.run_overdue_and_upcoming_billing_reminders',
        'schedule': timedelta(hours=24),
    },
    'business-summary-daily': {
        'task': 'apps.notifications.tasks.run_periodic_business_summaries',
        'schedule': timedelta(hours=24),
        'args': ('daily',),
    },
    'business-summary-weekly': {
        'task': 'apps.notifications.tasks.run_periodic_business_summaries',
        'schedule': timedelta(days=7),
        'args': ('weekly',),
    },
    'business-summary-monthly': {
        'task': 'apps.notifications.tasks.run_periodic_business_summaries',
        'schedule': timedelta(days=30),
        'args': ('monthly',),
    },
}

# Brevo (Sendinblue) Integration
BREVO_API_KEY = os.getenv('BREVO_API_KEY', '')
BREVO_SENDER_EMAIL = os.getenv('BREVO_SENDER_EMAIL', 'no-reply@invoicemanager.com')
BREVO_SENDER_NAME = os.getenv('BREVO_SENDER_NAME', 'Enterprise Invoice System')

# CORS
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:5173').split(',')
CORS_ALLOW_CREDENTIALS = True

from corsheaders.defaults import default_headers
CORS_ALLOW_HEADERS = list(default_headers) + [
    'x-tenant-id',
]

# CSRF Trusted Origins
CSRF_TRUSTED_ORIGINS = os.getenv('CSRF_TRUSTED_ORIGINS', 'http://localhost:5173,http://localhost:8000').split(',')

# Security Protection Config
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
CSRF_COOKIE_HTTPONLY = True
SESSION_COOKIE_HTTPONLY = True

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# Structured Logging System
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
        'file': {
            'level': 'WARNING',
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'django_error.log',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# Swagger UI Documentation Config
SPECTACULAR_SETTINGS = {
    'TITLE': 'Enterprise SaaS Invoice Management API',
    'DESCRIPTION': 'Production-ready secure REST API serving multi-tenant billing, customer profiles, dynamic approvals and recurring billing features.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# =============================================================================
# Django-Axes: Account Lockout & Brute-Force Protection (OWASP A07:2021)
# =============================================================================
AXES_FAILURE_LIMIT = int(os.getenv('AXES_FAILURE_LIMIT', '5'))  # Lock after N failed attempts
AXES_COOLOFF_TIME = int(os.getenv('AXES_COOLOFF_TIME', '1'))    # Unlock after N hours
AXES_LOCKOUT_PARAMETERS = ['ip_address', 'username']             # Lock by IP and username
AXES_RESET_ON_SUCCESS = True                                     # Clear attempt count on success
AXES_ENABLE_ADMIN = True                                         # Show attempts in Django admin
AXES_LOCKOUT_RESPONSE_TYPE = 'json'                              # Return JSON instead of 403 page

# Axes authentication backend — required for axes to work with custom user model
AUTHENTICATION_BACKENDS = [
    'axes.backends.AxesStandaloneBackend',
    'django.contrib.auth.backends.ModelBackend',
]

# =============================================================================
# File Upload Security Limits
# =============================================================================
FILE_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv('FILE_UPLOAD_MAX_MEMORY_SIZE', str(10 * 1024 * 1024)))  # 10MB
DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.getenv('FILE_UPLOAD_MAX_MEMORY_SIZE', str(10 * 1024 * 1024)))  # 10MB
DATA_UPLOAD_MAX_NUMBER_FIELDS = int(os.getenv('DATA_UPLOAD_MAX_NUMBER_FIELDS', '1000'))

# =============================================================================
# Application URLs
# =============================================================================
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://localhost:5173')
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:8000')