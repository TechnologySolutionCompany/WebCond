**PROJECT RESTRUCTURING PROMPT — WebCond SaaS Platform**

You are tasked with restructuring an existing web application called **WebCond** into a scalable, production-ready **multi-tenant SaaS platform** focused on condominium management.

The current system is functional but designed for a single condominium. The goal is to transform it into a professional platform capable of handling multiple condominiums, with proper authentication, role management, and administrative control.

---

## 🎯 CORE OBJECTIVE

Convert the system into a **multi-condominium SaaS platform** with:

* Centralized architecture
* Tenant isolation
* Role-based access control
* CPF-based authentication
* Manual but structured payment system (Pix QR Code)
* A global administrative panel for platform management

---

## 🧱 1. MULTI-TENANT ARCHITECTURE (CRITICAL)

### Create a main entity: `condominiums`

Each condominium must have its own isolated data environment.

All major entities must include:

* `condominium_id`

### Affected tables include:

* users / profiles
* residents
* charges (billing)
* announcements
* documents
* incidents

### Result:

Each user can only access data from their own condominium.

---

## 👤 2. USER ROLES & PERMISSIONS

Implement role-based access:

* `RESIDENT`
* `ADMIN_CONDOMINIUM` (Syndic / Manager)
* `PLATFORM_ADMIN`

### Permissions:

**Resident**

* View charges
* View announcements
* Access documents
* Submit incidents

**Condominium Admin (Syndic)**

* Manage residents
* Create charges
* Upload Pix QR Codes
* Mark payments as received
* Manage announcements and documents

**Platform Admin**

* Manage condominiums globally
* Approve or reject new condominiums
* Block/unblock condominium access
* Edit condominium metadata
* View usage metrics (NOT financial data)

---

## 🔐 3. AUTHENTICATION (CPF + PASSWORD)

### Requirements:

* Single login screen (no role selection)
* Authentication via:

  * CPF
  * Password

### Behavior:

After login:

* System identifies user role automatically
* Redirects to appropriate dashboard:

  * Resident → Resident Dashboard
  * Condominium Admin → Admin Dashboard
  * Platform Admin → Global Admin Panel

### Important:

* Supabase Auth may still use email internally
* CPF must be unique and validated
* CPF stored without formatting, displayed formatted

---

## 🧹 4. REMOVE TEST AUTH LOGIC

Remove all temporary or unsafe authentication logic such as:

* Auto-creating users
* Default admin assignment
* Fallback roles
* Any development-only authentication shortcuts

Ensure production-grade authentication only.

---

## 🏢 5. CONDOMINIUM REGISTRATION

### Add a "Register Condominium" feature on the login screen

Fields required:

**Condominium Info**

* Name
* CNPJ
* Address
* ZIP Code
* WhatsApp
* Number of units
* Bank details

**Syndic Info**

* Name
* CPF
* Email
* Password

### Behavior:

* Create condominium with status: `PENDING`
* Create initial admin user
* Access is restricted until approved

---

## 🧑‍💼 6. GLOBAL ADMIN PANEL (PLATFORM ADMIN)

Create a dedicated panel for platform management.

### Features:

* View all condominiums

* Filter by status:

  * Pending
  * Active
  * Rejected
  * Blocked

* Actions:

  * Approve condominium
  * Reject condominium
  * Block access (disable all users from that condominium)
  * Unblock access
  * Edit condominium data

### Important restriction:

Platform Admin **must NOT have access to financial data**, such as:

* charges
* payments
* resident financial history

Only operational/platform-level data is allowed.

---

## 📊 7. ADMIN PANEL DASHBOARD (PLATFORM ADMIN)

The platform admin panel should include:

* Summary metrics:

  * Total condominiums
  * Active vs pending
  * Total users
* Basic charts and usage overview
* Ability to select a condominium and view:

  * Number of residents
  * Syndic information
  * Condominium status
  * Plan configuration

---

## 💰 8. BILLING SYSTEM (MANUAL PIX)

### Current phase: Manual payments

### Workflow:

**Admin (Syndic):**

* Creates a charge
* Defines:

  * Amount
  * Description
  * Due date
* Uploads:

  * Pix QR Code (image)
  * Optional Pix "copy and paste" code

**Resident:**

* Views charge
* Sees QR Code
* Copies Pix code
* Pays using banking app

**Admin:**

* Confirms payment manually
* Marks charge as paid

---

## 🧾 9. DATABASE STRUCTURE FOR CHARGES

Enhance billing table with:

* `pix_qrcode_url`
* `pix_copy_paste_code`
* `payment_status`
* `paid_at`
* `confirmed_by`
* `receipt_url` (optional)

### Suggested statuses:

* `PENDING`
* `PAID`
* `OVERDUE`
* `CANCELLED`

---

## 🔒 10. SECURITY & DATA ISOLATION

Implement strict access control:

* Users only access their condominium data
* Role-based filtering
* Condominium status must affect access:

  * BLOCKED → no login allowed

Use backend-level protection (e.g., RLS if using Supabase)

---

## 🧭 11. IMPLEMENTATION ORDER

Follow this sequence:

1. Remove test authentication logic
2. Create `condominiums` table
3. Add `condominium_id` across database
4. Refactor queries for tenant isolation
5. Implement roles and permissions
6. Build CPF-based login system
7. Create condominium registration flow
8. Build global admin panel
9. Improve billing system with Pix (manual)
10. Refine UI/UX

---

## 🚫 12. OUT OF SCOPE (FOR NOW)

Do NOT implement yet:

* Automatic payment confirmation
* Banking APIs or webhooks
* Subscription billing systems
* Financial analytics
* Complex automation

Focus on structure first.

---

## ✅ FINAL GOAL

Deliver a SaaS platform that is:

* Multi-tenant
* Secure
* Role-based
* Ready for real users
* Scalable for future payment automation

---

End of prompt.
