export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_verified: boolean;
  two_factor_enabled: boolean;
}

export interface Organization {
  id: string;
  name: string;
  tax_number: string;
  email: string;
  phone: string;
  currency: string;
  logo_url?: string;
  billing_address?: any;
  payment_upi_id?: string | null;
  payment_merchant_name?: string | null;
  payment_qr_code?: string | null;
  created_at: string;
}

export interface Member {
  id: string;
  user: User;
  role: 'owner' | 'admin' | 'manager' | 'accountant' | 'employee' | 'viewer';
  created_at: string;
}

export interface Customer {
  id: string;
  contact_name: string;
  email: string;
  phone: string;
  billing_address: {
    street: string;
    city: string;
    state: string;
    country: string;
    zip: string;
  };
  shipping_address: {
    street: string;
    city: string;
    state: string;
    country: string;
    zip: string;
  };
  notes?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  _status?: 'saving' | 'error';
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  description?: string;
  price: number;
  tax_rate: number;
  hsn_sac_code?: string;
  is_active: boolean;
  type: 'product' | 'service';
  inventory_count: number;
  created_at: string;
  updated_at: string;
  _status?: 'saving' | 'error';
}

export interface InvoiceLineItem {
  id?: string;
  product: string;
  product_name?: string;
  description?: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_amount?: number;
  total_amount?: number;
}

export interface InvoiceWorkflowHistory {
  id: string;
  action: string;
  from_status: string;
  to_status: string;
  performed_by_name: string;
  comment?: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  customer: string;
  customer_detail?: Customer;
  invoice_number: string;
  status: 'draft' | 'pending' | 'approved' | 'sent' | 'viewed' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  amount_paid?: number;
  currency: string;
  terms?: string;
  notes?: string;
  pdf_url?: string;
  line_items: InvoiceLineItem[];
  workflow_history?: InvoiceWorkflowHistory[];
  created_at: string;
  updated_at: string;
  _status?: 'saving' | 'error';
}

export interface AuditLog {
  id: string;
  user_email?: string;
  action: string;
  entity_name: string;
  entity_id?: string;
  previous_state: Record<string, any>;
  new_state: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}
