import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

export type ClientInvoiceStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface ClientInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  amount: number;
  status: ClientInvoiceStatus;
  pdfUrl?: string;
}

export const invoiceService = {
  async getClientInvoices(clientId: string): Promise<ClientInvoice[]> {
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.warn('Invoice table not ready, returning empty invoice list', {
          code: error.code,
          message: error.message,
        });
        return [];
      }

      return (data || []).map((invoice: {
        id: string;
        invoice_number?: string;
        created_at?: string;
        invoice_date?: string;
        due_date?: string;
        amount?: number;
        total_amount?: number;
        status?: string;
        pdf_url?: string;
      }) => {
        const rawStatus = String(invoice.status || 'PENDING').toUpperCase();
        const status: ClientInvoiceStatus =
          rawStatus === 'PAID' || rawStatus === 'OVERDUE' || rawStatus === 'CANCELLED'
            ? rawStatus
            : 'PENDING';

        return {
          id: invoice.id,
          invoiceNumber: invoice.invoice_number || invoice.id,
          date: invoice.invoice_date || invoice.created_at || new Date().toISOString(),
          dueDate: invoice.due_date || invoice.created_at || new Date().toISOString(),
          amount: Number(invoice.amount ?? invoice.total_amount ?? 0),
          status,
          pdfUrl: invoice.pdf_url || undefined,
        };
      });
    } catch (error) {
      logger.error('Failed to get client invoices:', error);
      return [];
    }
  },
};
