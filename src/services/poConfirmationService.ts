import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';
import { logPOAudit } from './orderDocumentService';
import { UserRole } from '../types/types';

export interface POConfirmationMetadata {
  notTestOrderConfirmedAt: string;
  paymentTermsConfirmedAt: string;
  submittedAt: string;
  clientIp?: string;
  userAgent?: string;
  locale?: string;
  timezone?: string;
}

async function resolveClientIp(): Promise<string | undefined> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return undefined;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch('https://api64.ipify.org?format=json', {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return undefined;
    const payload = (await response.json()) as { ip?: string };
    return payload.ip;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export const poConfirmationService = {
  async submitClientPOConfirmation(orderId: string, metadata: POConfirmationMetadata): Promise<void> {
    const context = {
      clientIp: metadata.clientIp ?? await resolveClientIp(),
      userAgent: metadata.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
      locale: metadata.locale ?? (typeof navigator !== 'undefined' ? navigator.language : undefined),
      timezone: metadata.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    const { data: authData } = await supabase.auth.getUser();
    const actorUserId = authData.user?.id;

    const { error } = await supabase
      .from('orders')
      .update({
        not_test_order_confirmed_at: metadata.notTestOrderConfirmedAt,
        payment_terms_confirmed_at: metadata.paymentTermsConfirmedAt,
        client_po_confirmation_submitted_at: metadata.submittedAt,
      })
      .eq('id', orderId);

    if (error) {
      logger.error('Failed to persist PO confirmation metadata', { orderId, error });
      throw error;
    }

    if (actorUserId) {
      await logPOAudit({
        orderId,
        actorUserId,
        actorRole: UserRole.CLIENT,
        action: 'CLIENT_PO_CONFIRMED',
        metadata: {
          ...metadata,
          ...context,
        },
      });
    }

    // Best-practice: frontend forwards context; backend should still treat IP/user-agent as authoritative on server side.
  },
};
