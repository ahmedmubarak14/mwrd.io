import { supabase } from '../lib/supabase';
import { leadsService } from './leadsService';
import { logger } from '../utils/logger';

export interface CreditIncreaseRequestPayload {
  clientId: string;
  clientName: string;
  companyName: string;
  email: string;
  phone?: string;
  currentLimit: number;
  currentUsed: number;
  requestedLimit: number;
  reason: string;
}

export interface CreditIncreaseRequestResult {
  success: boolean;
  channel: 'credit_increase_requests' | 'leads';
  error?: string;
}

const isSchemaCompatibilityError = (error: { code?: string; message?: string } | null | undefined): boolean => {
  if (!error) return false;
  if (error.code === '42P01' || error.code === '42703') return true;
  const message = error.message || '';
  return /relation .* does not exist/i.test(message) || /column .* does not exist/i.test(message);
};

const toRoundedAmount = (value: number) => Math.round(value * 100) / 100;

export const creditRequestService = {
  async submitCreditIncreaseRequest(
    payload: CreditIncreaseRequestPayload
  ): Promise<CreditIncreaseRequestResult> {
    const requestedLimit = toRoundedAmount(Number(payload.requestedLimit || 0));
    const currentLimit = toRoundedAmount(Number(payload.currentLimit || 0));
    const currentUsed = toRoundedAmount(Math.max(0, Number(payload.currentUsed || 0)));
    const reason = payload.reason.trim();

    if (!payload.clientId || !Number.isFinite(requestedLimit) || requestedLimit <= currentLimit || reason.length < 5) {
      return { success: false, channel: 'credit_increase_requests', error: 'Invalid request payload' };
    }

    const { error: insertError } = await (supabase as any)
      .from('credit_increase_requests')
      .insert({
        client_id: payload.clientId,
        requested_limit: requestedLimit,
        current_limit: currentLimit,
        current_used: currentUsed,
        reason,
        status: 'PENDING',
      });

    if (!insertError) {
      return { success: true, channel: 'credit_increase_requests' };
    }

    if (!isSchemaCompatibilityError(insertError)) {
      logger.error('Failed to submit credit increase request', insertError);
      return { success: false, channel: 'credit_increase_requests', error: insertError.message };
    }

    try {
      await leadsService.submitLead({
        name: payload.clientName || payload.companyName || 'Client',
        company_name: payload.companyName || payload.clientName || 'Client',
        email: payload.email || 'unknown@mwrd.local',
        phone: payload.phone,
        account_type: 'client',
        notes: [
          '[CREDIT_INCREASE_REQUEST]',
          `client_id=${payload.clientId}`,
          `current_limit=${currentLimit}`,
          `current_used=${currentUsed}`,
          `requested_limit=${requestedLimit}`,
          `reason=${reason}`,
        ].join('\n'),
      });
      return { success: true, channel: 'leads' };
    } catch (fallbackError: any) {
      logger.error('Failed to submit credit increase request fallback via leads', fallbackError);
      return {
        success: false,
        channel: 'leads',
        error: fallbackError?.message || insertError.message,
      };
    }
  },
};

export default creditRequestService;
