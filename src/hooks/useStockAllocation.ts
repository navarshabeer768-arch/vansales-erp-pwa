import { useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface AllocationResult {
  batch_id: string | null;
  batch_no: string | null;
  expiry_date: string | null;
  allocated_quantity: number;
}

export function useStockAllocation() {
  const [allocating, setAllocating] = useState(false);

  const allocateFifo = useCallback(async (
    locationType: 'warehouse' | 'van', locationId: string, productId: string, quantity: number
  ): Promise<{ allocations: AllocationResult[]; error: string | null }> => {
    setAllocating(true);
    const { data, error } = await supabase.rpc('allocate_stock_fifo', {
      p_location_type: locationType, p_location_id: locationId, p_product_id: productId, p_quantity: quantity,
    });
    setAllocating(false);
    if (error) return { allocations: [], error: error.message };
    return { allocations: (data ?? []) as AllocationResult[], error: null };
  }, []);

  return { allocating, allocateFifo };
}
