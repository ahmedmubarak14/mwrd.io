import { supabase } from '../lib/supabase';
import { Database } from '../types/database';
import { logger } from '../utils/logger';

export type Transaction = Database['public']['Tables']['transactions']['Row'];

const isSchemaCompatibilityError = (error: { code?: string; message?: string } | null | undefined): boolean => {
    if (!error) return false;
    if (error.code === '42P01' || error.code === '42703') return true;
    const message = error.message || '';
    return /relation .* does not exist/i.test(message) || /column .* does not exist/i.test(message);
};

export const transactionsService = {
    async getMyTransactions(userId: string) {
        const { data, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (!error) return data;

        if (!isSchemaCompatibilityError(error)) {
            throw error;
        }

        logger.warn('transactions table unavailable, deriving financial activity from orders', {
            userId,
            error: error.message,
        });

        const orderSelectVariants = [
            'id, amount, status, created_at, date, client_id, supplier_id',
            'id, total_amount, status, created_at, date, client_id, supplier_id',
        ];

        let orderRows: any[] | null = null;
        let orderError: any = null;
        for (const selectClause of orderSelectVariants) {
            const result = await (supabase as any)
                .from('orders')
                .select(selectClause)
                .or(`client_id.eq.${userId},supplier_id.eq.${userId}`)
                .order('created_at', { ascending: false });

            if (!result.error) {
                orderRows = result.data || [];
                orderError = null;
                break;
            }

            orderError = result.error;
            if (!isSchemaCompatibilityError(result.error)) {
                break;
            }
        }

        if (orderError) {
            throw orderError;
        }

        return (orderRows || []).map((row: any) => {
            const isSupplierRecord = String(row.supplier_id || '') === userId;
            const normalizedStatus = String(row.status || '').toUpperCase();
            const isSettled = normalizedStatus === 'PAYMENT_CONFIRMED'
                || normalizedStatus === 'DELIVERED'
                || normalizedStatus === 'COMPLETED';
            const type = isSettled ? 'PAYMENT' : 'CREDIT_USAGE';
            const amount = Number(row.amount ?? row.total_amount ?? 0);
            const createdAt = row.created_at || row.date || new Date().toISOString();

            return {
                id: String(row.id),
                user_id: userId,
                type,
                amount,
                reference_id: String(row.id),
                description: isSupplierRecord
                    ? (isSettled ? 'Supplier payout progress' : 'Order fulfillment in progress')
                    : (isSettled ? 'Client payment settled' : 'Order placed on credit'),
                created_at: createdAt,
            };
        }) as Transaction[];
    },

    async getBalance(userId: string) {
        const selectVariants = [
            'current_balance, credit_limit, credit_used',
            'current_balance, credit_limit',
            'credit_limit, credit_used',
            'credit_limit',
        ];

        let data: any = null;
        let lastError: any = null;

        for (const selectClause of selectVariants) {
            const result = await (supabase as any)
                .from('users')
                .select(selectClause)
                .eq('id', userId)
                .single();

            if (!result.error) {
                data = result.data;
                lastError = null;
                break;
            }

            lastError = result.error;
            if (!isSchemaCompatibilityError(result.error)) {
                break;
            }
        }

        if (lastError) {
            throw lastError;
        }

        const creditLimit = Number(data?.credit_limit ?? 0);
        const creditUsed = Math.max(Number(data?.credit_used ?? 0), 0);
        const currentBalance = Number(data?.current_balance);
        const normalizedBalance = Number.isFinite(currentBalance)
            ? Math.max(Math.abs(currentBalance), creditUsed)
            : creditUsed;

        return {
            balance: normalizedBalance,
            creditLimit,
        };
    },

    // Admin only
    async createTransaction(userId: string, type: string, amount: number, description?: string) {
        const { data, error } = await supabase
            .from('transactions')
            .insert({
                user_id: userId,
                type: type as any,
                amount,
                description
            })
            .select()
            .single();

        if (!error) return data;

        if (!isSchemaCompatibilityError(error)) {
            throw error;
        }

        logger.warn('transactions table unavailable, skipping transaction insert', {
            userId,
            type,
            amount,
            error: error.message,
        });

        return {
            id: `tx-${Date.now()}`,
            user_id: userId,
            type,
            amount,
            reference_id: null,
            description: description || null,
            created_at: new Date().toISOString(),
        };
    },
};
