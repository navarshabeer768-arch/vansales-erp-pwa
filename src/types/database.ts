// Hand-authored types for the tables used by the modules built so far.
// Once the schema is pushed to a real Supabase project, regenerate the
// authoritative version with:
//   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
// and merge in the domain helper types below.

export interface Company {
  id: string;
  name: string;
  legal_name: string | null;
  slug: string;
  store_id: string;
  logo_url: string | null;
  currency: string;
  tax_number: string | null;
  tax_rate: number;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  subscription_plan: 'trial' | 'basic' | 'professional' | 'enterprise';
  subscription_status: 'active' | 'suspended' | 'cancelled';
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type RoleCode =
  | 'super_admin' | 'company_admin' | 'warehouse_manager' | 'van_sales_manager'
  | 'salesman' | 'driver' | 'cash_collector' | 'accounts' | 'auditor' | 'stock_controller';

export interface Role {
  id: string;
  company_id: string | null;
  name: string;
  code: RoleCode;
  is_system: boolean;
}

export type ModuleName =
  | 'dashboard' | 'sales' | 'van_loading' | 'van_unloading' | 'route_planning'
  | 'customer_visit' | 'inventory' | 'warehouse' | 'purchases' | 'payments'
  | 'collections' | 'returns' | 'accounting' | 'reports' | 'hr' | 'gps_tracking' | 'settings';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';

export interface AppUser {
  id: string;
  company_id: string;
  role_id: string;
  employee_code: string | null;
  username: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  device_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  company_id: string;
  parent_id: string | null;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Brand {
  id: string;
  company_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Unit {
  id: string;
  company_id: string;
  name: string;
  symbol: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  company_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms_days: number;
  is_active: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  company_id: string;
  category_id: string | null;
  brand_id: string | null;
  supplier_id: string | null;
  base_unit_id: string;
  sku: string;
  name: string;
  description: string | null;
  barcode: string | null;
  qr_code: string | null;
  image_url: string | null;
  weight: number | null;
  volume: number | null;
  cost_price: number;
  selling_price: number;
  wholesale_price: number | null;
  retail_price: number | null;
  offer_price: number | null;
  tax_rate: number;
  min_stock: number;
  max_stock: number | null;
  track_batches: boolean;
  track_expiry: boolean;
  track_serials: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined
  category?: Pick<Category, 'id' | 'name'> | null;
  brand?: Pick<Brand, 'id' | 'name'> | null;
  base_unit?: Pick<Unit, 'id' | 'name' | 'symbol'> | null;
}

export interface Warehouse {
  id: string;
  company_id: string;
  code: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  manager_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Batch {
  id: string;
  company_id: string;
  product_id: string;
  batch_no: string;
  lot_no: string | null;
  manufacture_date: string | null;
  expiry_date: string | null;
  cost_price: number | null;
  created_at: string;
}

export interface WarehouseStock {
  id: string;
  company_id: string;
  warehouse_id: string;
  product_id: string;
  batch_id: string | null;
  quantity: number;
  reserved_quantity: number;
  updated_at: string;
  // joined
  product?: Pick<Product, 'id' | 'name' | 'sku'>;
  batch?: Pick<Batch, 'id' | 'batch_no' | 'expiry_date'> | null;
}

export interface StockAdjustment {
  id: string;
  company_id: string;
  location_type: 'warehouse' | 'van';
  location_id: string;
  adjustment_type: 'count' | 'damage' | 'loss' | 'correction';
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface StockAdjustmentItem {
  id: string;
  adjustment_id: string;
  product_id: string;
  batch_id: string | null;
  system_quantity: number;
  counted_quantity: number;
  difference: number;
}

export interface WarehouseTransfer {
  id: string;
  company_id: string;
  transfer_no: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: 'pending' | 'in_transit' | 'completed' | 'cancelled';
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  completed_at: string | null;
}

// Minimal Database interface shape so `createClient<Database>` type-checks.
// Extend per-table as more modules are built.
export interface Database {
  public: {
    Tables: Record<string, { Row: any; Insert: any; Update: any }>;
  };
}
