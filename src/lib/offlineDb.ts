import Dexie, { Table } from 'dexie';

export interface PendingSale {
  client_uuid: string; // primary key, doubles as the server-side idempotency key
  payload: {
    p_customer_id: string | null;
    p_van_id: string | null;
    p_salesman_id: string | null;
    p_sale_type: string;
    p_items: unknown[];
    p_payments: unknown[];
    p_client_uuid: string;
    p_latitude: number | null;
    p_longitude: number | null;
  };
  created_at: string;
  last_error: string | null;
}

export interface PendingCollection {
  client_uuid: string;
  payload: {
    p_customer_id: string;
    p_method: string;
    p_amount: number;
    p_reference_no: string | null;
    p_cheque_date: string | null;
    p_applied_to_sale_id: string | null;
    p_notes: string | null;
    p_client_uuid: string;
  };
  created_at: string;
  last_error: string | null;
}

export interface PendingReturn {
  client_uuid: string;
  payload: {
    p_return_type: string;
    p_customer_id: string | null;
    p_supplier_id: string | null;
    p_location_type: string;
    p_location_id: string;
    p_items: unknown[];
    p_client_uuid: string;
  };
  created_at: string;
  last_error: string | null;
}

class OfflineDb extends Dexie {
  pendingSales!: Table<PendingSale, string>;
  pendingCollections!: Table<PendingCollection, string>;
  pendingReturns!: Table<PendingReturn, string>;

  constructor() {
    super('vansales-offline');
    this.version(1).stores({
      pendingSales: 'client_uuid, created_at',
    });
    this.version(2).stores({
      pendingSales: 'client_uuid, created_at',
      pendingCollections: 'client_uuid, created_at',
      pendingReturns: 'client_uuid, created_at',
    });
  }
}

export const offlineDb = new OfflineDb();

/** True for connectivity failures (fetch never reached the server), false for
 *  application-level errors (e.g. a Postgres exception the RPC raised). */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // "Failed to fetch"
  if (!navigator.onLine) return true;
  return false;
}
