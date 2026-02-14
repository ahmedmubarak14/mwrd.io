import { supabase } from '../lib/supabase';

/**
 * Category service – uses the single-table `categories` approach
 * where subcategories have a non-null `parent_id` referencing a top-level row.
 */

export interface SubcategoryDefinition {
    id: string;
    name: string;
    icon: string;
    sortOrder: number;
    isActive: boolean;
    translationKey?: string;
}

export interface CategoryDefinition {
    id: string;
    name: string;
    icon: string;
    sortOrder: number;
    isActive: boolean;
    subcategories: SubcategoryDefinition[];
}

interface CategoryRow {
    id: string;
    name: string;
    parent_id: string | null;
    icon?: string | null;
    sort_order?: number | null;
    is_active?: boolean | null;
    created_at?: string;
    updated_at?: string;
}

// Re-export Database-compatible types for backward compat
export type Category = CategoryRow;
export type Subcategory = CategoryRow;

const toSafeOrder = (value: number | null | undefined, fallback: number) =>
    Number.isFinite(Number(value)) ? Number(value) : fallback;

const isRowActive = (value: boolean | null | undefined) =>
    value !== false;

const sortByOrderAndName = (a: CategoryRow, b: CategoryRow) => {
    const orderDiff = toSafeOrder(a.sort_order, 9999) - toSafeOrder(b.sort_order, 9999);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name);
};

const fetchCategoryRows = async (): Promise<CategoryRow[]> => {
    const { data, error } = await supabase
        .from('categories')
        .select('*')
        .limit(1000);

    if (error) throw error;
    return (data || []) as CategoryRow[];
};

const MISSING_COLUMN_REGEX = /column "([^"]+)" of relation "categories" does not exist/i;

const pruneMissingColumn = (
    payload: Record<string, unknown>,
    error: { message?: string }
): Record<string, unknown> | null => {
    const match = MISSING_COLUMN_REGEX.exec(error?.message || '');
    if (!match) return null;
    const columnName = match[1];
    if (!Object.prototype.hasOwnProperty.call(payload, columnName)) return null;
    const next = { ...payload };
    delete next[columnName];
    return next;
};

const insertCategoryRow = async (payload: Record<string, unknown>) => {
    let insertPayload = { ...payload };

    while (true) {
        const { data, error } = await (supabase as any)
            .from('categories')
            .insert(insertPayload)
            .select()
            .single();

        if (!error) return data;

        const nextPayload = pruneMissingColumn(insertPayload, error);
        if (nextPayload) {
            insertPayload = nextPayload;
            continue;
        }

        throw error;
    }
};

const updateCategoryRow = async (id: string, payload: Record<string, unknown>) => {
    let updatePayload = { ...payload };

    while (Object.keys(updatePayload).length > 0) {
        const { data, error } = await (supabase as any)
            .from('categories')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();

        if (!error) return data;

        const nextPayload = pruneMissingColumn(updatePayload, error);
        if (nextPayload) {
            updatePayload = nextPayload;
            continue;
        }

        throw error;
    }

    const { data, error } = await (supabase as any)
        .from('categories')
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
};

export const categoryService = {
    /**
     * Returns the full category hierarchy from the database.
     * Uses single `categories` table with parent_id.
     */
    async getCategoryTree(): Promise<Record<string, SubcategoryDefinition[]>> {
        const rows = await fetchCategoryRows();
        const topLevel = rows.filter(r => !r.parent_id);
        const children = rows.filter(r => !!r.parent_id);

        const tree: Record<string, SubcategoryDefinition[]> = {};

        const toCategoryKey = (name: string): string => {
            switch (name) {
                case 'IT Supplies': return 'it';
                case 'Office': return 'office';
                case 'Breakroom': return 'breakroom';
                case 'Janitorial': return 'janitorial';
                case 'Maintenance': return 'maintenance';
                default: return name.toLowerCase().replace(/\s+/g, '');
            }
        };

        topLevel
            .filter(cat => isRowActive(cat.is_active))
            .sort(sortByOrderAndName)
            .forEach((cat) => {
                const catKey = toCategoryKey(cat.name);
                tree[cat.name] = children
                    .filter((sub) => sub.parent_id === cat.id && isRowActive(sub.is_active))
                    .sort(sortByOrderAndName)
                    .map((sub) => {
                        const subKey = sub.name.toLowerCase().replace(/[\s_-]+/g, '').replace(/[^a-z0-9]/g, '');
                        return {
                            id: sub.id,
                            name: sub.name,
                            icon: sub.icon || 'label',
                            sortOrder: toSafeOrder(sub.sort_order, 0),
                            isActive: isRowActive(sub.is_active),
                            translationKey: `categories.${catKey}.subcategories.${subKey}.label`,
                        };
                    });
            });

        return tree;
    },

    /**
     * Returns a flat list of main category names.
     */
    async getMainCategories(): Promise<string[]> {
        const rows = await fetchCategoryRows();
        return rows
            .filter((row) => !row.parent_id && isRowActive(row.is_active))
            .sort(sortByOrderAndName)
            .map((row) => row.name);
    },

    /**
     * Returns subcategories for a specific category name.
     */
    async getSubcategories(categoryName: string): Promise<SubcategoryDefinition[]> {
        const rows = await fetchCategoryRows();
        const parent = rows.find((row) => !row.parent_id && row.name === categoryName);
        if (!parent) return [];

        const toCategoryKey = (name: string): string => {
            switch (name) {
                case 'IT Supplies': return 'it';
                case 'Office': return 'office';
                case 'Breakroom': return 'breakroom';
                case 'Janitorial': return 'janitorial';
                case 'Maintenance': return 'maintenance';
                default: return name.toLowerCase().replace(/\s+/g, '');
            }
        };
        const catKey = toCategoryKey(categoryName);

        return rows
            .filter((row) => row.parent_id === parent.id && isRowActive(row.is_active))
            .sort(sortByOrderAndName)
            .map((sub) => {
                const subKey = sub.name.toLowerCase().replace(/[\s_-]+/g, '').replace(/[^a-z0-9]/g, '');
                return {
                    id: sub.id,
                    name: sub.name,
                    icon: sub.icon || 'label',
                    sortOrder: toSafeOrder(sub.sort_order, 0),
                    isActive: isRowActive(sub.is_active),
                    translationKey: `categories.${catKey}.subcategories.${subKey}.label`,
                };
            });
    },

    // ── ADMIN CRUD OPERATIONS ──────────────────────────────────────────────

    async getAllCategoriesWithSubs(): Promise<CategoryDefinition[]> {
        const rows = await fetchCategoryRows();
        const topLevel = rows.filter(r => !r.parent_id);
        const children = rows.filter(r => !!r.parent_id);

        return topLevel
            .sort(sortByOrderAndName)
            .map(cat => ({
            id: cat.id,
            name: cat.name,
            icon: cat.icon || 'folder',
            sortOrder: toSafeOrder(cat.sort_order, 0),
            isActive: isRowActive(cat.is_active),
            subcategories: children
                .filter(sub => sub.parent_id === cat.id)
                .sort(sortByOrderAndName)
                .map(sub => ({
                    id: sub.id,
                    name: sub.name,
                    icon: sub.icon || 'label',
                    sortOrder: toSafeOrder(sub.sort_order, 0),
                    isActive: isRowActive(sub.is_active),
                }))
        }));
    },

    async createCategory(category: { name: string; icon?: string; sort_order?: number; is_active?: boolean }) {
        return insertCategoryRow({
            name: category.name,
            icon: category.icon || 'folder',
            sort_order: category.sort_order ?? 0,
            is_active: category.is_active ?? true,
            parent_id: null,
        });
    },

    async updateCategory(id: string, updates: Partial<{ name: string; icon: string; sort_order: number; is_active: boolean }>) {
        return updateCategoryRow(id, updates as Record<string, unknown>);
    },

    async deleteCategory(id: string) {
        // Delete children first (subcategories), then parent
        await supabase.from('categories').delete().eq('parent_id', id);
        const { error } = await supabase.from('categories').delete().eq('id', id);
        if (error) throw error;
    },

    async createSubcategory(subcategory: { parent_id: string; name: string; icon?: string; sort_order?: number; is_active?: boolean }) {
        return insertCategoryRow({
            parent_id: subcategory.parent_id,
            name: subcategory.name,
            icon: subcategory.icon || 'label',
            sort_order: subcategory.sort_order ?? 0,
            is_active: subcategory.is_active ?? true,
        });
    },

    async updateSubcategory(id: string, updates: Partial<{ name: string; icon: string; sort_order: number; is_active: boolean }>) {
        return updateCategoryRow(id, updates as Record<string, unknown>);
    },

    async deleteSubcategory(id: string) {
        const { error } = await supabase.from('categories').delete().eq('id', id);
        if (error) throw error;
    },

    // Helper for reordering
    async updateCategoryOrder(items: { id: string; sort_order: number }[]) {
        await Promise.all(items.map(async (item) => {
            try {
                await supabase.from('categories').update({ sort_order: item.sort_order }).eq('id', item.id);
            } catch (error: any) {
                if (!MISSING_COLUMN_REGEX.test(error?.message || '')) {
                    throw error;
                }
            }
        }));
    },

    async updateSubcategoryOrder(items: { id: string; sort_order: number }[]) {
        await Promise.all(items.map(async (item) => {
            try {
                await supabase.from('categories').update({ sort_order: item.sort_order }).eq('id', item.id);
            } catch (error: any) {
                if (!MISSING_COLUMN_REGEX.test(error?.message || '')) {
                    throw error;
                }
            }
        }));
    }
};
