# Manual Setup & Production Deployment Guide: Invoice Management System

This document outlines the step-by-step procedure to deploy the multi-tenant SaaS Invoice Management System into development, staging, or production environments without containerization.

---

## 1. Environment Variables Configuration

Create a `.env` file in the `backend/` directory with the following variables:

```ini
# Django settings
DJANGO_SECRET_KEY=production-secure-random-hash-2026-saas-key
DJANGO_DEBUG=False
ALLOWED_HOSTS=api.yourdomain.com,localhost,127.0.0.1

# Database settings
# Note: The application uses PostgreSQL with automated fallback to local SQLite for development.
# If integrating with MongoDB/other databases, add your specific connection URI here.
POSTGRES_DB=invoice_manager
POSTGRES_USER=saas_admin
POSTGRES_PASSWORD=SecureProductionPasswordChangeMe2026
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# Redis and Channels
REDIS_URL=redis://localhost:6379/0

# AWS S3 Storage credentials (optional fallback to local disk if omitted)
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtlFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_STORAGE_BUCKET_NAME=saas-invoice-documents-bucket
AWS_S3_REGION_NAME=ap-south-1

# Brevo (Sendinblue) SMTP / API Integration
BREVO_API_KEY=xkeysib-your-long-api-key-hash
BREVO_SENDER_EMAIL=billing@yourcompany.com
BREVO_SENDER_NAME=Acme Corporate Invoicing
```

Create a `.env` file in the `frontend/` directory:
```ini
VITE_API_URL=http://localhost:8000/api/v1
```

---

## 2. Python Virtual Environment Setup

To run the Flask/Django backend services directly on the host machine:

```bash
# Navigate to the backend directory
cd backend

# Create a virtual environment
python -m venv .venv

# Activate the virtual environment
# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On Linux/macOS:
source .venv/bin/activate
```

---

## 3. Dependency Installation

Install all required Python backend dependencies manually inside the activated virtual environment:

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

For the React frontend:
```bash
# Navigate to the frontend directory
cd ../frontend

# Install node modules
npm install
```

---

## 4. Database Configuration

### PostgreSQL Setup (Default Core Engine)
1. Install PostgreSQL 15+ on your host machine.
2. Create the database and admin user:
   ```sql
   CREATE DATABASE invoice_manager;
   CREATE USER saas_admin WITH PASSWORD 'SecureProductionPasswordChangeMe2026';
   GRANT ALL PRIVILEGES ON DATABASE invoice_manager TO saas_admin;
   ```
3. Update `POSTGRES_HOST=localhost` in your backend `.env` file.

### SQLite Setup (Zero-Configuration Fallback)
If you omit the PostgreSQL connection parameters from `.env`, the system will automatically configure and use a local SQLite database (`db.sqlite3` in the backend root directory).

### MongoDB Configuration (External/Atlas Integration)
If your branch/extension utilizes a MongoDB instance (such as MongoDB Atlas):
1. Create a cluster on MongoDB Atlas or install MongoDB locally on your host.
2. If using local MongoDB, start the service:
   ```bash
   # Linux
   sudo systemctl start mongod
   # Windows (via Services.msc or Command Prompt)
   net start MongoDB
   ```
3. Set your connection string in the environment configurations:
   ```ini
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/myDatabase
   ```

---

## 5. Backend Startup

To start the backend servers manually:

```bash
# Ensure you are in the backend directory with virtualenv activated
cd backend

# Run database migrations
python manage.py migrate

# Seed initial default organization, user roles, catalog product SKUs, and templates
python seed_data.py

# Start the ASGI server (Daphne) on port 8000
daphne -b 127.0.0.1 -p 8000 config.asgi:application
```

Start the Celery worker for background processing (PDF generation and mail tasks):
```bash
celery -A config worker --loglevel=info
```

Start the Celery beat scheduler for recurring cycles:
```bash
celery -A config beat --loglevel=info --scheduler django_celery_beat.schedulers:DatabaseScheduler
```

---

## 6. Frontend Startup

Run the Vite development server locally:

```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 7. Production Deployment without Docker

To run the application in a production environment without Docker, manage the processes using systemd services and Nginx.

### Systemd Service Setup
Create a service file for Daphne: `/etc/systemd/system/daphne.service`:
```ini
[Unit]
Description=Daphne ASGI Server for Invoice Management
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/var/www/Invoice_Management_System/backend
ExecStart=/var/www/Invoice_Management_System/backend/.venv/bin/daphne -b 127.0.0.1 -p 8000 config.asgi:application
Restart=always

[Install]
WantedBy=multi-user.target
```

Create a service file for Celery: `/etc/systemd/system/celery.service`:
```ini
[Unit]
Description=Celery Worker for Invoice Management
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/var/www/Invoice_Management_System/backend
ExecStart=/var/www/Invoice_Management_System/backend/.venv/bin/celery -A config worker --loglevel=info
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable and start the host services:
```bash
sudo systemctl daemon-reload
sudo systemctl enable daphne celery
sudo systemctl start daphne celery
```

### Reverse Proxy Setup (Nginx + SSL)

Copy `nginx/default.conf` to `/etc/nginx/sites-available/default` and update parameters.

Install Let's Encrypt certificates using Certbot:
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

### Monitoring & Logs
View logs directly using `journalctl`:
```bash
# View Daphne server logs
journalctl -u daphne -f

# View Celery logs
journalctl -u celery -f
```
Error logs are written to `/var/www/Invoice_Management_System/backend/django_error.log`.
