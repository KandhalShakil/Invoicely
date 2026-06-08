<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&height=250&section=header&text=Invoicely%20SaaS&fontSize=80&fontAlignY=35&animation=twinkling&fontColor=ffffff" width="100%" />

[![Typing SVG](https://readme-typing-svg.herokuapp.com?font=Inter&weight=800&size=30&pause=1000&color=10B981&center=true&vCenter=true&width=800&lines=Enterprise+Invoice+Management;Secure+Multi-Tenant+SaaS;Real-Time+WebSocket+Sync;AI-Powered+Invoice+Parsing)](https://git.io/typing-svg)

<p align="center">
  <img src="https://img.shields.io/badge/Django-092E20?style=for-the-badge&logo=django&logoColor=white" alt="Django" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />
  <img src="https://img.shields.io/badge/Celery-37814A?style=for-the-badge&logo=celery&logoColor=white" alt="Celery" />
</p>

**A premium, high-performance platform featuring real-time state synchronization, catalog compliance, AI-assisted generation, and strict audit log trails.**

<img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="800" />

</div>

## ✨ Table of Contents
<details open>
<summary><b>📖 Click to expand</b></summary>

1. [🚀 Project Overview](#-project-overview)
2. [🔥 Core Feature Showcase](#-core-feature-showcase)
3. [⚡ System Architecture](#-system-architecture)
4. [📡 Real-Time WebSocket Sync](#-real-time-websocket-sync)
5. [🛠️ Technology Stack](#-technology-stack)
6. [📥 Installation & Setup](#-installation--setup)
7. [🔌 API Documentation](#-api-documentation)
8. [🛡️ Security Architecture](#-security-architecture)

</details>

<div align="center">
  <img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="800" />
</div>

## 🚀 Project Overview

**Invoicely** is a multi-tenant Invoice and Client Management SaaS designed for high-performance enterprise billing. 

<img align="right" src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExMjRlaHAwaWozdDZjdW9nbmJydWNxMDBhMWU5czNpeDdjdXZ0azR5bSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3oKIPa2TdahY8LAAxy/giphy.gif" width="250" />

### 🎯 The Problem It Solves
Modern financial systems suffer from data drift, laggy synchronization, and compliance issues. Invoicely fixes this through:
- 🔒 **Ledger Security & Data Isolation:** Strict RBAC and Tenant Query filters.
- ⚡ **WebSocket Real-Time Sync:** Instant UI refreshes across active users.
- 📋 **Catalog Compliance:** Invoice items locked strictly to catalog product prices.
- 📱 **Standardized 10-Digit Contacts:** Cleaned global directories.

<br><br>

<div align="center">
  <img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="800" />
</div>

## 🔥 Core Feature Showcase

| 🌟 Feature | 🛠️ Implementation Detail |
| :--- | :--- |
| 🏢 **SaaS Tenancy** | Dynamic RBAC middleware intercepting SQL queries via `TenantQuerySet`. |
| 📡 **WebSockets** | Daphne ASGI gateway broadcasts live signals. Client UI reloads on `app:sync`. |
| 🔒 **Catalog Locking** | Immutable input cells validated against product SKU ledgers. |
| 🤖 **AI Smart Drafts** | NLP engine processing raw text ("consulting 75k") into invoice arrays. |
| 🖺 **OCR Extractor** | Parses images & PDFs to extract bill items and match inventory SKUs. |
| 🕵️ **Audit Trails** | Thread-safe `ContextVar` logging user actions, IPs, and payload deltas. |

<div align="center">
  <img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="800" />
</div>

## ⚡ System Architecture

<details>
<summary><b>1️⃣ Multi-Tenant Data Flow (Click to expand)</b></summary>
<br>

```mermaid
graph TD
    Client[Client Browser] -->|REST Request with Organization Header| Gateway[Nginx Reverse Proxy]
    Gateway -->|Forward to Daphne Port 8000| AuthMiddleware[Authentication Middleware]
    AuthMiddleware -->|Validate JWT token| TenantMiddleware[Tenant Context Middleware]
    TenantMiddleware -->|Inject active_organization_id| ViewSet[Django ModelViewSet]
    ViewSet -->|Filter via TenantQuerySet| DB[(Neon PostgreSQL DB)]
    DB -->|Return organization isolated rows| ViewSet
    ViewSet -->|Serialize & envelope| Client
```
</details>

<details>
<summary><b>2️⃣ Event-Driven Real-Time Topology (Click to expand)</b></summary>
<br>

```mermaid
graph LR
    UserA[User A writes Customer] -->|POST Request| API[Django REST API]
    API -->|Save to Database| Signals[post_save Signal Receiver]
    Signals -->|Extract Org ID| GroupLayer[Channels Layer]
    GroupLayer -->|group_send| Daphne[Daphne Server]
    Daphne -->|WebSocket frame| WS[Client Browser]
    WS -->|Dispatch 'app:sync'| GlobalBus[Event Bus]
    GlobalBus -->|Reload UI| Dashboard[Dashboard View]
```
</details>

<div align="center">
  <img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="800" />
</div>

## 🛠️ Technology Stack

<div align="center">
  <table>
    <tr>
      <td align="center" width="33%">
        <h3>🎨 Frontend Core</h3>
        <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" height="40" alt="react logo"  />
        <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" height="40" alt="typescript logo"  />
        <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/tailwindcss/tailwindcss-original-wordmark.svg" height="40" alt="tailwindcss logo"  />
        <br><b>React 18 • TypeScript • Tailwind</b>
      </td>
      <td align="center" width="33%">
        <h3>⚙️ Backend Core</h3>
        <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/django/django-plain.svg" height="40" alt="django logo"  />
        <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" height="40" alt="python logo"  />
        <br><b>Django 4.2 • REST Framework • Daphne</b>
      </td>
      <td align="center" width="33%">
        <h3>🗄️ Database & Infra</h3>
        <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/postgresql/postgresql-original.svg" height="40" alt="postgresql logo"  />
        <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/redis/redis-original.svg" height="40" alt="redis logo"  />
        <br><b>PostgreSQL • Redis • Celery</b>
      </td>
    </tr>
  </table>
</div>

<div align="center">
  <img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="800" />
</div>

## 📥 Installation & Setup

1️⃣ **Clone the repository:**
```bash
git clone https://github.com/KandhalShakil/Invoice_Management_System.git
cd Invoice_Management_System
```

2️⃣ **Start the Backend:**
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python seed_data.py
python manage.py runserver
```

3️⃣ **Start the Frontend:**
```bash
cd ../frontend
npm install
npm run dev
```

<div align="center">
  <img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="800" />
</div>

## 🛡️ Security Architecture

> [!WARNING]
> Security is our top priority. We implement zero-trust policies inside our architecture.

- 🔑 **Context-Bound Isolation:** `TenantMiddleware` extracts active tenant IDs from custom headers. A thread-local `ContextVar` context ensures database actions query *only* records associated with the active organization.
- 🛑 **Brute Force Defense:** Django-Axes intercepts logins. If an IP executes **5 consecutive invalid attempts**, they are locked out.
- ⏱️ **API Throttling Rules:** IP and user throttles enforce security limits (e.g. `LoginRateThrottle` at 10 req/min).

<div align="center">
  <img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" width="800" />
  
  <br>
  
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&height=100&section=footer&text=Developed%20by%20Kandhal%20Shakil&fontSize=20&fontAlignY=50" width="100%" />
</div>
