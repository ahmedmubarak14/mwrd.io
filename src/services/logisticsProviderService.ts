import { supabase } from '../lib/supabase';
import type { LogisticsProvider } from '../types/types';
import { logger } from '../utils/logger';

type DbProviderRow = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  service_areas: string[] | null;
  is_active: boolean | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

const mapDbProvider = (row: DbProviderRow): LogisticsProvider => ({
  id: row.id,
  name: row.name || '',
  contactName: row.contact_name || '',
  contactPhone: row.contact_phone || '',
  contactEmail: row.contact_email || '',
  serviceAreas: Array.isArray(row.service_areas) ? row.service_areas : [],
  isActive: row.is_active !== false,
  notes: row.notes || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapToDbUpdates = (
  updates: Partial<Omit<LogisticsProvider, 'id' | 'createdAt' | 'updatedAt'>>
): Record<string, unknown> => {
  const payload: Record<string, unknown> = {};
  if (updates.name !== undefined) payload.name = updates.name;
  if (updates.contactName !== undefined) payload.contact_name = updates.contactName || null;
  if (updates.contactPhone !== undefined) payload.contact_phone = updates.contactPhone || null;
  if (updates.contactEmail !== undefined) payload.contact_email = updates.contactEmail || null;
  if (updates.serviceAreas !== undefined) payload.service_areas = updates.serviceAreas;
  if (updates.isActive !== undefined) payload.is_active = updates.isActive;
  if (updates.notes !== undefined) payload.notes = updates.notes || null;
  return payload;
};

const MISSING_COLUMN_REGEX = /column "([^"]+)" of relation "logistics_providers" does not exist/i;

const pruneMissingColumn = (
  payload: Record<string, unknown>,
  error: { message?: string } | null | undefined
): Record<string, unknown> | null => {
  const match = MISSING_COLUMN_REGEX.exec(error?.message || '');
  if (!match) return null;
  const column = match[1];
  if (!Object.prototype.hasOwnProperty.call(payload, column)) return null;
  const next = { ...payload };
  delete next[column];
  return next;
};

const isMissingRelationError = (error: { code?: string; message?: string } | null | undefined) => {
  if (!error) return false;
  if (error.code === '42P01') return true;
  return /relation .*logistics_providers.* does not exist/i.test(error.message || '');
};

export const logisticsProviderService = {
  async listProviders(): Promise<LogisticsProvider[]> {
    const { data, error } = await (supabase as any)
      .from('logistics_providers')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      if (isMissingRelationError(error)) {
        logger.warn('logistics_providers table is unavailable; returning empty provider list');
        return [];
      }
      throw error;
    }

    return (data || []).map((row: DbProviderRow) => mapDbProvider(row));
  },

  async createProvider(
    payload: Omit<LogisticsProvider, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<LogisticsProvider> {
    let insertPayload = mapToDbUpdates(payload);

    while (Object.keys(insertPayload).length > 0) {
      const { data, error } = await (supabase as any)
        .from('logistics_providers')
        .insert(insertPayload)
        .select('*')
        .single();

      if (!error) {
        return mapDbProvider(data as DbProviderRow);
      }

      const nextPayload = pruneMissingColumn(insertPayload, error);
      if (nextPayload) {
        insertPayload = nextPayload;
        continue;
      }

      throw error;
    }

    throw new Error('No compatible logistics provider columns available for insert');
  },

  async updateProvider(
    providerId: string,
    updates: Partial<Omit<LogisticsProvider, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<LogisticsProvider> {
    let updatePayload = mapToDbUpdates(updates);

    while (Object.keys(updatePayload).length > 0) {
      const { data, error } = await (supabase as any)
        .from('logistics_providers')
        .update(updatePayload)
        .eq('id', providerId)
        .select('*')
        .single();

      if (!error) {
        return mapDbProvider(data as DbProviderRow);
      }

      const nextPayload = pruneMissingColumn(updatePayload, error);
      if (nextPayload) {
        updatePayload = nextPayload;
        continue;
      }

      throw error;
    }

    throw new Error('No compatible logistics provider columns available for update');
  },
};

