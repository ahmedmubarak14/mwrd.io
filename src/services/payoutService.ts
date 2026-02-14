import { supabase } from '../lib/supabase';
import { SupplierPayout } from '../types/types';
import { logger } from '../utils/logger';

type DbPayoutRow = {
  id: string;
  supplier_id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';
  payment_method?: string | null;
  reference_number?: string | null;
  paid_at?: string | null;
  created_by?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

const mapDbPayout = (row: DbPayoutRow): SupplierPayout => ({
  id: row.id,
  supplierId: row.supplier_id,
  orderId: row.order_id,
  amount: Number(row.amount || 0),
  currency: row.currency || 'SAR',
  status: row.status,
  paymentMethod: row.payment_method || undefined,
  referenceNumber: row.reference_number || undefined,
  paidAt: row.paid_at || undefined,
  createdBy: row.created_by || undefined,
  notes: row.notes || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const isSchemaCompatibilityError = (error: { code?: string; message?: string } | null | undefined): boolean => {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42703') return true;
  const message = error.message || '';
  return /relation .* does not exist/i.test(message) || /column .* does not exist/i.test(message);
};

export const payoutService = {
  async getSupplierPayouts(): Promise<SupplierPayout[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('supplier_payouts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        if (!isSchemaCompatibilityError(error)) {
          throw error;
        }
        logger.warn('Unable to fetch supplier payouts (table may not be ready)', {
          code: error.code,
          message: error.message,
        });
        return [];
      }

      return (data || []).map((row: DbPayoutRow) => mapDbPayout(row));
    } catch (error) {
      logger.error('Failed to load supplier payouts:', error);
      throw error;
    }
  },

  async updatePayoutStatus(
    payoutId: string,
    status: SupplierPayout['status'],
    notes?: string
  ): Promise<boolean> {
    try {
      const { error } = await (supabase as any).rpc('admin_update_payout_status', {
        p_payout_id: payoutId,
        p_status: status,
        p_notes: notes ?? null,
      });

      if (!error) return true;

      logger.warn('Payout status RPC failed, falling back to direct update', {
        payoutId,
        status,
        error: error.message,
      });

      const updates: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };
      if (status === 'PAID') {
        updates.paid_at = new Date().toISOString();
      }
      if (notes) {
        updates.notes = notes;
      }

      const { data: updatedRow, error: updateError } = await (supabase as any)
        .from('supplier_payouts')
        .update(updates)
        .eq('id', payoutId)
        .select('id')
        .maybeSingle();

      if (updateError) {
        logger.error('Failed to update payout status:', updateError);
        return false;
      }

      if (!updatedRow) {
        logger.error('Failed to update payout status: payout not found', { payoutId, status });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Failed to update payout status:', error);
      return false;
    }
  },

  async recordSupplierPayout(payload: {
    supplierId: string;
    orderId: string;
    amount: number;
    paymentMethod?: string;
    referenceNumber?: string;
    notes?: string;
    currency?: string;
  }): Promise<SupplierPayout | null> {
    try {
      const { data: rpcData, error: rpcError } = await (supabase as any).rpc('admin_record_supplier_payout', {
        p_supplier_id: payload.supplierId,
        p_order_id: payload.orderId,
        p_amount: payload.amount,
        p_payment_method: payload.paymentMethod || null,
        p_reference_number: payload.referenceNumber || null,
        p_notes: payload.notes || null,
      });

      if (!rpcError) {
        const payoutId = Array.isArray(rpcData)
          ? rpcData[0]?.payout_id
          : (rpcData as any)?.payout_id;
        if (payoutId) {
          const { data: payoutRow } = await (supabase as any)
            .from('supplier_payouts')
            .select('*')
            .eq('id', payoutId)
            .single();
          if (payoutRow) {
            return mapDbPayout(payoutRow as DbPayoutRow);
          }
        }
      } else {
        logger.warn('Payout create RPC failed, falling back to direct insert', {
          error: rpcError.message,
        });
      }

      const { data, error } = await (supabase as any)
        .from('supplier_payouts')
        .insert({
          supplier_id: payload.supplierId,
          order_id: payload.orderId,
          amount: payload.amount,
          currency: payload.currency || 'SAR',
          status: 'PENDING',
          payment_method: payload.paymentMethod || null,
          reference_number: payload.referenceNumber || null,
          notes: payload.notes || null,
        })
        .select('*')
        .single();

      if (error) {
        logger.error('Failed to record supplier payout:', error);
        return null;
      }

      return mapDbPayout(data as DbPayoutRow);
    } catch (error) {
      logger.error('Failed to record supplier payout:', error);
      return null;
    }
  },
};
