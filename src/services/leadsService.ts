
import { supabase } from '../lib/supabase';

export interface Lead {
    id?: string;
    name: string;
    company_name: string;
    email: string;
    phone?: string;
    account_type: 'client' | 'supplier';
    notes?: string;
    commercial_registration?: string;
    tax_id?: string;
    status?: 'PENDING' | 'CONTACTED' | 'CONVERTED' | 'REJECTED';
    created_at?: string;
}

export const leadsService = {
    async submitLead(lead: Lead) {
        const missingColumnRegex = /column "([^"]+)" of relation "leads" does not exist/i;
        const pruneMissingColumn = (
            payload: Record<string, unknown>,
            error: { message?: string }
        ): Record<string, unknown> | null => {
            const match = missingColumnRegex.exec(error?.message || '');
            if (!match) return null;
            const columnName = match[1];
            if (!Object.prototype.hasOwnProperty.call(payload, columnName)) return null;
            const nextPayload = { ...payload };
            delete nextPayload[columnName];
            return nextPayload;
        };

        let insertPayload: Record<string, unknown> = {
            name: lead.name,
            company_name: lead.company_name,
            email: lead.email,
            phone: lead.phone,
            account_type: lead.account_type,
            notes: lead.notes,
            commercial_registration: lead.commercial_registration,
            tax_id: lead.tax_id,
        };

        while (Object.keys(insertPayload).length > 0) {
            const { error } = await (supabase as any)
                .from('leads')
                .insert(insertPayload);

            if (!error) {
                return { success: true };
            }

            const nextPayload = pruneMissingColumn(insertPayload, error);
            if (nextPayload) {
                insertPayload = nextPayload;
                continue;
            }

            throw error;
        }

        return { success: true };
    },

    async getLeads() {
        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Lead[];
    },

    async updateLeadStatus(id: string, status: Lead['status']) {
        const { data, error } = await supabase
            .from('leads')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    }
};
