
# Invoicely - Invoice Management System

<p align="center">
  <img src="./assets/banner.svg" alt="Invoicely Hero Banner" width="800" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Django-4.2.30-092E20?style=for-the-badge&logo=django&logoColor=white" alt="Django" />
  <img src="https://img.shields.io/badge/React-18.2.0-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5.2.2-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-Active-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Celery-5.3.6-37814A?style=for-the-badge&logo=celery&logoColor=white" alt="Celery" />
  <img src="https://img.shields.io/badge/Docker-Coordinated-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/Build-Passing-10b981?style=for-the-badge&logo=github-actions&logoColor=white" alt="Build" />
</p>

<p align="center">
  <b>A premium, enterprise-grade multi-tenant SaaS platform featuring real-time state synchronization, catalog compliance checking, AI-assisted invoice generation, and strict audit log trails.</b>
</p>

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 📖 Table of Contents
1. [Project Overview](#-project-overview)
2. [Key Architecture Enhancements](#-key-architecture-enhancements)
3. [Core Feature Showcase](#-core-feature-showcase)
4. [Technology Stack](#-technology-stack)
5. [System Architecture](#-system-architecture)
6. [Real-Time WebSocket Sync](#-real-time-websocket-sync)
7. [Performance Optimizations](#-performance-optimizations)
8. [Installation & Setup](#-installation--setup)
9. [API Documentation](#-api-documentation)
10. [Folder Structure](#-folder-structure)
11. [Security Architecture](#-security-architecture)
12. [Project Roadmap](#-project-roadmap)
13. [Contributing Guide](#-contributing-guide)
14. [License](#-license)
15. [Authors](#-authors)

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 🌟 Project Overview

Invoicely is a multi-tenant Invoice and Client Management SaaS designed for high-performance enterprise billing. It provides secure multi-tenant isolation, automated invoice workflows (approvals, notifications, reminders), background queues, and strict transaction auditing.

### The Problem It Solves
Modern financial systems suffer from data drift, out-of-catalog invoice edits, laggy client synchronization, and visual inconsistencies during payment transitions. Invoicely resolves these pain points through:
- **Ledger Security & Data Isolation**: Tenant organization contexts are dynamically evaluated at the query level, eliminating data leaks between organizations.
- **WebSocket Real-Time Sync**: Avoids database request spam. Updates broadcast instant state refresh instructions (such as customer creation or invoice status transitions) across connected clients.
- **Strict Compliance Constraints**: Invoice line rates and descriptions are locked to the catalog definitions. Price changes must occur on the catalog page, ensuring future compliance.
- **10-Digit Standardized Contacts**: Normalizes and cleans phone numbers globally, keeping contacts uniform.

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 🛠️ Key Architecture Enhancements

This project has been hardened with production-grade enterprise practices:
- **Proactive Token Refresh Mutex**: Frontend implements a custom axios interceptor which checks expiration times and queries the token refresh API *before* sending requests. Multiple concurrent requests queue behind a shared Promise mutex, preventing double refresh submissions.
- **Zero Mock Data Charts**: Real-time KPI summaries, chronological revenue graphs, and GST summaries calculate directly from database models in INR (`₹`) format. Zero-states are rendered beautifully when data is empty.
- **Visual UX Blockers**: Forms, submit targets, and modals disable automatically during active transactions (`isSubmitting` flag), displaying responsive "Saving..." indicators.
- **Resilient Fallback Middleware**: If a local development environment lacks Redis or Celery, the system dynamically switches to SQLite, in-memory local caches, and synchronous task execution.

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 🚀 Core Feature Showcase

| Module | Feature | Implementation Detail |
| :--- | :--- | :--- |
| **SaaS Tenancy** | Organization Isolation | Dynamic RBAC middleware, custom `TenantQuerySet` intercepts all SQL queries based on user membership keys. |
| **WebSockets** | Live Sync & Notifications | Daphne ASGI gateway broadcasts saved/deleted signals to org groups. Frontend `app:sync` custom event fires client reloads. |
| **Catalog Locking** | Price/Description Compliance | Read-only input cells on frontend form; validation checks catalog product records on backend serializers. |
| **AI Smart Drafts** | NLP Prompt to Invoice | AI model processes raw texts (e.g. "consulting 75k, 10% disc") and pre-fills catalog matching rows. |
| **OCR Extractor** | File PDF/Image Parser | Extracts lines and matches against catalog SKUs to auto-build invoice draft items. |
| **Auditing Trails** | Session Logging | Thread-safe `ContextVar` logs all user modifications (IP, agent, timestamp) inside `audit_logs` schemas. |

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 💻 Technology Stack

### Frontend Core
- **Framework:** React 18 with Vite fast bundling.
- **Languages:** TypeScript (strict type checking, 0 compilation errors).
- **Styling:** Tailwind CSS with custom CSS glassmorphism, extensions, and micro-animations.
- **Icons:** Lucide React.
- **Charts:** Recharts (responsive vector area and bar graphs).

### Backend Core
- **Framework:** Django 4.2.30 & Django REST Framework.
- **ASGI Server:** Daphne gateway for WebSocket channels.
- **Queues:** Celery with Redis broker (task timing, mail queues, PDF compile workers).
- **Caching:** Redis cache layer with memory fallbacks.

### Database & Security
- **Production Database:** Neon Serverless PostgreSQL with SSL.
- **Local Dev Database:** SQLite connection mapping.
- **Authentication:** Simple JWT (JSON Web Tokens) with sliding refresh intervals.
- **Security Audit:** Django Axes (lockout after 5 failures), API rate limiting throttles.

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 📊 System Architecture

### 1. Multi-Tenant Isolated Data Flow
All incoming API requests pass through context-injecting middlewares before hitting database models:

```mermaid
graph TD
    Client[Client Browser] -->|REST Request with Organization Header| Gateway[Nginx Reverse Proxy]
    Gateway -->|Forward to Daphne Port 8000| AuthMiddleware[Authentication Middleware]
    AuthMiddleware -->|Validate JWT token| TenantMiddleware[Tenant Context Middleware]
    TenantMiddleware -->|Inject active_organization_id to thread ContextVar| ViewSet[Django ModelViewSet]
    ViewSet -->|Query Set filtering via TenantQuerySet| DB[(Neon PostgreSQL DB)]
    DB -->|Return organization isolated rows| ViewSet
    ViewSet -->|Serialize & envelope| Client
```

### 2. Proactive JWT Refresh Mutex Pattern
The frontend interceptor resolves potential race conditions when access tokens expire concurrently:

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client Browser
    participant Ax as Axios Interceptor
    participant M as Shared Mutex Promise
    participant API as Django REST API

    Note over Client, API: Access Token Expired (or expiring within 10s)
    Client->>Ax: GET /api/v1/invoices/
    Client->>Ax: GET /api/v1/customers/ (Concurrent Request)
    Ax->>M: Check if refresh is already in progress
    Note over M: No refresh in progress
    Ax->>M: Instantiate refreshPromise
    M->>API: POST /api/v1/auth/token/refresh/ (With Refresh Token)
    Note over Ax: Second request waits on same refreshPromise
    API-->>M: 200 OK (New Access Token)
    M-->>Ax: Resolve new token to all queued requests
    Ax->>API: GET /api/v1/invoices/ (With New Token)
    Ax->>API: GET /api/v1/customers/ (With New Token)
    API-->>Client: Return invoice and customer data
```

### 3. Event-Driven Real-Time Sync Topology
When User A alters a database object, the system broadcasts changes instantly to other active users:

```mermaid
graph LR
    UserA[User A writes Customer] -->|POST Request| API[Django REST API]
    API -->|Save to Database| Signals[post_save Signal Receiver]
    Signals -->|Extract Org ID| GroupLayer[Channels Channel Layer]
    GroupLayer -->|group_send org_orgId| Daphne[Daphne ASGI Server]
    Daphne -->|WebSocket data_changed frame| WS[Client WebSocket Connection]
    WS -->|Dispatch custom window event 'app:sync'| GlobalBus[Global Custom Event Bus]
    GlobalBus -->|Trigger fetchDashboardData / fetchInvoices| Dashboard[Dashboard View]
    GlobalBus -->|Reload lists| Invoices[Invoices Registry]
    Dashboard -->|Dynamic Reload| API
    Invoices -->|Dynamic Reload| API
```

### 4. Database Schema (Entity Relationships)
```mermaid
erDiagram
    ORGANIZATION ||--o{ USER_MEMBERSHIP : contains
    ORGANIZATION ||--o{ CUSTOMER : possesses
    ORGANIZATION ||--o{ PRODUCT : catalogs
    ORGANIZATION ||--o{ INVOICE : records
    USER ||--o{ USER_MEMBERSHIP : belongs_to
    CUSTOMER ||--o{ INVOICE : billed_to
    INVOICE ||--|{ INVOICE_LINE_ITEM : contains
    PRODUCT ||--o{ INVOICE_LINE_ITEM : references
    USER ||--o{ NOTIFICATION : receives

    ORGANIZATION {
        uuid id PK
        string name
        string phone
        string tax_id
    }
    USER_MEMBERSHIP {
        uuid id PK
        uuid organization_id FK
        uuid user_id FK
        string role
    }
    CUSTOMER {
        uuid id PK
        uuid organization_id FK
        string contact_name
        string email
        string phone
    }
    PRODUCT {
        uuid id PK
        uuid organization_id FK
        string sku
        string name
        decimal price
        decimal tax_rate
    }
    INVOICE {
        uuid id PK
        uuid organization_id FK
        uuid customer_id FK
        string invoice_number
        decimal total_amount
        string status
        date due_date
    }
    INVOICE_LINE_ITEM {
        uuid id PK
        uuid invoice_id FK
        uuid product_id FK
        string description
        decimal quantity
        decimal unit_price
        decimal tax_rate
    }
```

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 📡 Real-Time WebSocket Sync

Invoicely implements a production-ready WebSockets system using Django Channels to broadcast changes instantly without page refreshes.

### How it works:
1. **Signal Broadcast:** Django signals (`post_save`, `post_delete`) intercept all create, update, and delete actions on `Customer`, `Invoice`, `Product`, `Organization`, and `UserOrganizationMembership` models.
2. **WebSockets Group Send:** The signal handler automatically routes a `data_changed` event payload to the Django Channels layer, targeting the organization group `org_<org_id>`.
3. **Global Custom Event:** `NotificationCenter.tsx` catches the WebSocket frame and dispatches a client-side `app:sync` custom event.
4. **Optimistic Refetches:** Dashboard cards, KPI statistics, client listings, and invoice registers listen to `app:sync` and trigger background fetches immediately.

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## ⚡ Performance Optimizations

To handle heavy SaaS loads, several database and caching optimizations were performed:
- **N+1 SQL Reduction**: DRF viewsets utilize `select_related('customer')` and `prefetch_related('line_items', 'line_items__product')` to reduce query counts from $O(N)$ database round-trips to a single query.
- **Database Indexes**: Custom B-tree indexes added to search fields and tenant isolation FKs (`organization_id`, `invoice_number`, `sku`, `email`).
- **Persistent DB Connections**: Configured `CONN_MAX_AGE: 60` to keep Neon DB connections open, reducing TCP and SSL handshake latency.
- **Client Debouncing**: Frontend implements a 300ms debounce buffer on search forms to prevent keystroke database query spam.

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 📥 Installation & Setup

Follow these steps to set up the project locally.

### Prerequisites
- Python 3.10+
- Node.js 18+
- Redis (optional; falling back to in-memory channels automatically if not found)

---

### Backend Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/KandhalShakil/Invoice_Management_System.git
   cd Invoice_Management_System/backend
   ```

2. **Create a virtual environment & install dependencies:**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables:**
   Create a `.env` file inside the `backend/` directory:
   ```ini
   DJANGO_SECRET_KEY=dev-secret-key-change-me
   DJANGO_DEBUG=True
   ALLOWED_HOSTS=localhost,127.0.0.1
   
   # Leave blank to fallback to SQLite locally
   POSTGRES_DB=
   POSTGRES_USER=
   POSTGRES_PASSWORD=
   POSTGRES_HOST=
   POSTGRES_PORT=
   
   # Leave blank to fallback to local in-memory structures
   REDIS_URL=
   ```

4. **Run Database Migrations:**
   ```bash
   python manage.py migrate
   ```

5. **Seed Test Database Records:**
   ```bash
   python seed_data.py
   ```
   *Creates an admin user: `admin@invoicemanager.com` with password `AdminPassword123!`.*

6. **Start the Development Server:**
   ```bash
   python manage.py runserver
   ```

---

### Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd ../frontend
   ```

2. **Install node dependencies:**
   ```bash
   npm install
   ```

3. **Configure Frontend Environment:**
   Create a `.env` file inside the `frontend/` directory:
   ```ini
   VITE_API_URL=http://localhost:8000/api/v1
   ```

4. **Start Vite Development Server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

### Docker setup (Orchestration)
To build and start the entire stack (Postgres, Redis, Celery, Daphne, Vite build, Nginx proxy):
```bash
docker-compose up --build -d
```

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 🔌 API Documentation

### 1. Authentication Endpoints

#### Obtain JWT Token Pairs
- **Endpoint:** `POST /api/v1/auth/token/`
- **Request Body:**
  ```json
  {
    "email": "admin@invoicemanager.com",
    "password": "AdminPassword123!"
  }
  ```
- **Response:**
  ```json
  {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

#### Refresh Access Token
- **Endpoint:** `POST /api/v1/auth/token/refresh/`
- **Request Body:**
  ```json
  {
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
- **Response:**
  ```json
  {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

---

### 2. Core Invoice Endpoints

#### List Invoices
- **Endpoint:** `GET /api/v1/invoices/?page=1&search=INV-&status=draft`
- **Headers:** `Authorization: Bearer <access_token>`
- **Response:**
  ```json
  {
    "count": 1,
    "next": null,
    "previous": null,
    "results": [
      {
        "id": "7ac9486a-e573-4b31-b01c-09e3aeebb5c2",
        "invoice_number": "INV-2026-0001",
        "customer_detail": {
          "contact_name": "Amit Sharma",
          "email": "amit@delhitech.in",
          "phone": "9988776655"
        },
        "issue_date": "2026-06-05",
        "due_date": "2026-07-05",
        "subtotal": 75000.00,
        "tax_amount": 13500.00,
        "discount_amount": 0.00,
        "total_amount": 88500.00,
        "status": "draft"
      }
    ]
  }
  ```

#### Create Compliance Locked Invoice
- **Endpoint:** `POST /api/v1/invoices/`
- **Request Body:**
  ```json
  {
    "customer": "customer-uuid-here",
    "issue_date": "2026-06-05",
    "due_date": "2026-07-05",
    "discount_amount": 1000.00,
    "currency": "INR",
    "line_items": [
      {
        "product": "product-uuid-here",
        "quantity": 2.0
      }
    ]
  }
  ```
  *(Note: Rate, description, and tax are automatically pulled and verified against the product catalog backend model.)*

#### Record Payment Transaction
- **Endpoint:** `POST /api/v1/invoices/{id}/record-payment/`
- **Request Body:**
  ```json
  {
    "amount": 88500.00,
    "comment": "Received via bank IMPS transfer."
  }
  ```
- **Response:** 200 OK with updated invoice instance details.

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 📁 Folder Structure

### Backend App Structure
```
backend/
├── apps/
│   ├── ai/             # OCR Extractor, smart invoice prompts
│   ├── audit_logs/     # Thread-safe logging, action capture
│   ├── authentication/ # JWT, login flow throttling
│   ├── core/           # Middlewares, signal broadcasters, shared validators
│   ├── customers/      # Contact models, address books
│   ├── invoices/       # Core billing ledger, workflows, PDF rendering
│   ├── notifications/  # User alerts, system messages
│   ├── organizations/  # Multi-tenant context models
│   └── products/       # Price catalogs & stock SKU logs
├── config/             # Django settings.py & project routes
├── tests/              # Pytest integration tests
├── Dockerfile          # Production backend daphne script
└── docker-compose.yml  # Multi-container local orchestration
```

### Frontend Structure
```
frontend/
├── src/
│   ├── components/     # NotificationCenter, ChartsPanel, Sidebar layouts
│   ├── context/        # AuthContext tenant state managers
│   ├── pages/          # Dashboard, Invoices, Customers, Products, Settings
│   ├── services/       # axios api.ts token interceptor
│   ├── types/          # Strict TypeScript interface registries
│   └── utils/          # 10-digit validation logic helpers
├── package.json        # Frontend config, dev scripts
├── tailwind.config.js  # Styling themes & visual tokens
└── vite.config.ts      # Vite server proxies
```

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 🛡️ Security Architecture

- **Context-Bound Tenant Isolation:** `TenantMiddleware` extracts active tenant IDs from custom headers. A thread-local `ContextVar` context ensures database actions query *only* records associated with the user's active organization.
- **Brute Force Defense (Axes Lockouts):** Django-Axes intercepts logins. If an IP or user record executes **5 consecutive invalid attempts**, they are locked out for **60 minutes**.
- **API Throttling Rules:** IP and user throttles enforce security:
  - `LoginRateThrottle` (10 req/min)
  - `RegisterRateThrottle` (5 req/hour)
  - `BurstRateThrottle` (60 req/min for active operations)
- **Sensitive Inputs Scrubbing:** Strict character filtering processes and sanitizes phone numbers, stripping characters, prefixes (`+91`), or spacing drift.

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 🗺️ Project Roadmap

- [x] Secure Multi-Tenant Context Isolation
- [x] Compliance catalog locking & calculation assertions
- [x] WebSocket synchronization & client reload triggers
- [x] Proactive JWT axios refresh with promise mutexes
- [x] Remove mock data arrays, standardise INR visuals
- [ ] Customizable HTML invoice print templates
- [ ] Excel/CSV ledger data export formats
- [ ] Offline payment sync adapters

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 🤝 Contributing Guide

1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Assert code compliance (`npx tsc --noEmit` & `.venv\Scripts\pytest`).
4. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
5. Push to the Branch (`git push origin feature/AmazingFeature`).
6. Open a Pull Request.

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

<p align="center">
  <img src="assets/separator.svg" alt="Separator" width="800" />
</p>

## 👥 Authors

- **Kandhal Shakil** - *Lead Engineer / Full-Stack Architect*
  - [LinkedIn](https://www.linkedin.com/in/kandhal-shakil-5311302b6)
  - [GitHub](https://github.com/KandhalShakil)
  - [Portfolio](https://www.kandhal.tech)
