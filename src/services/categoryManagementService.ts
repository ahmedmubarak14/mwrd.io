import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

interface CategoryRow {
  id: string;
  name: string;
  parent_id: string | null;
  icon: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  created_at?: string;
}

export interface AdminSubcategoryNode {
  id: string;
  parentId: string;
  name: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
}

export interface AdminCategoryNode {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  subcategories: AdminSubcategoryNode[];
}

interface GetTreeOptions {
  seedDefaults?: boolean;
}

interface UpsertCategoryInput {
  name: string;
  icon?: string;
  sortOrder: number;
  isActive?: boolean;
  parentId?: string | null;
}

const CATEGORY_ICON_FALLBACK: Record<string, string> = {
  Office: 'business',
  'IT Supplies': 'computer',
  Breakroom: 'local_cafe',
  Janitorial: 'cleaning_services',
  Maintenance: 'build',
};

const DEFAULT_CATEGORY_TREE: Record<string, Array<{ name: string; icon: string }>> = {
  Office: [
    { name: 'Paper', icon: 'description' },
    { name: 'Pens', icon: 'edit' },
    { name: 'Desk Accessories', icon: 'desk' },
  ],
  'IT Supplies': [
    { name: 'Laptops', icon: 'laptop_mac' },
    { name: 'Peripherals', icon: 'mouse' },
    { name: 'Networking', icon: 'router' },
  ],
  Breakroom: [
    { name: 'Coffee & Tea', icon: 'coffee' },
    { name: 'Snacks', icon: 'restaurant' },
    { name: 'Drinks', icon: 'local_drink' },
  ],
  Janitorial: [
    { name: 'Cleaning Supplies', icon: 'cleaning_services' },
    { name: 'Paper Products', icon: 'toilet_paper' },
    { name: 'Trash Bags', icon: 'delete' },
  ],
  Maintenance: [
    { name: 'Tools', icon: 'construction' },
    { name: 'Lighting', icon: 'lightbulb' },
    { name: 'Safety', icon: 'health_and_safety' },
  ],
};

const normalizeSortOrder = (value: number | null | undefined, fallback: number) =>
  Number.isFinite(value as number) ? Number(value) : fallback;

const normalizeIcon = (value: string | null | undefined, fallback = 'label') =>
  (value && value.trim()) || fallback;

const normalizeBoolean = (value: boolean | null | undefined, fallback = true) =>
  typeof value === 'boolean' ? value : fallback;

const MISSING_COLUMN_REGEX = /column "([^"]+)" of relation "categories" does not exist/i;

const pruneMissingColumnFromPayload = (
  payload: Record<string, unknown>,
  error: { message?: string }
): Record<string, unknown> | null => {
  const match = MISSING_COLUMN_REGEX.exec(error?.message || '');
  if (!match) return null;
  const column = match[1];
  if (!Object.prototype.hasOwnProperty.call(payload, column)) return null;
  const nextPayload = { ...payload };
  delete nextPayload[column];
  return nextPayload;
};

const mapRawRow = (raw: Record<string, unknown>): CategoryRow | null => {
  if (!raw.id || !raw.name) return null;
  const sortOrder = Number(raw.sort_order);
  return {
    id: String(raw.id),
    name: String(raw.name),
    parent_id: raw.parent_id ? String(raw.parent_id) : null,
    icon: typeof raw.icon === 'string' ? raw.icon : null,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : null,
    is_active: typeof raw.is_active === 'boolean' ? raw.is_active : null,
    created_at: typeof raw.created_at === 'string' ? raw.created_at : undefined,
  };
};

const mapRowsToTree = (rows: CategoryRow[]): AdminCategoryNode[] => {
  const topLevelRows = rows
    .filter((row) => !row.parent_id)
    .sort((a, b) => {
      const orderDiff = normalizeSortOrder(a.sort_order, 0) - normalizeSortOrder(b.sort_order, 0);
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });

  const childrenByParent = new Map<string, CategoryRow[]>();
  rows.forEach((row) => {
    if (!row.parent_id) return;
    const list = childrenByParent.get(row.parent_id) || [];
    list.push(row);
    childrenByParent.set(row.parent_id, list);
  });

  return topLevelRows.map((categoryRow, categoryIndex) => {
    const childRows = (childrenByParent.get(categoryRow.id) || []).sort((a, b) => {
      const orderDiff = normalizeSortOrder(a.sort_order, 0) - normalizeSortOrder(b.sort_order, 0);
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });

    return {
      id: categoryRow.id,
      name: categoryRow.name,
      icon: normalizeIcon(categoryRow.icon, CATEGORY_ICON_FALLBACK[categoryRow.name] || 'folder'),
      sortOrder: normalizeSortOrder(categoryRow.sort_order, categoryIndex + 1),
      isActive: normalizeBoolean(categoryRow.is_active, true),
      subcategories: childRows.map((subRow, subIndex) => ({
        id: subRow.id,
        parentId: categoryRow.id,
        name: subRow.name,
        icon: normalizeIcon(subRow.icon),
        sortOrder: normalizeSortOrder(subRow.sort_order, subIndex + 1),
        isActive: normalizeBoolean(subRow.is_active, true),
      })),
    };
  });
};

const fetchCategoryRows = async (): Promise<CategoryRow[]> => {
  const { data, error } = await (supabase as any)
    .from('categories')
    .select('*');

  if (error) {
    throw new Error(error.message || 'Failed to load categories');
  }

  return (data || [])
    .map((row: Record<string, unknown>) => mapRawRow(row))
    .filter((row: CategoryRow | null): row is CategoryRow => Boolean(row));
};

const insertCategoryRow = async (payload: Record<string, unknown>): Promise<{ id: string }> => {
  let insertPayload = { ...payload };

  while (true) {
    const { data, error } = await (supabase as any)
      .from('categories')
      .insert(insertPayload)
      .select('id')
      .single();

    if (!error && data?.id) {
      return { id: String(data.id) };
    }

    const nextPayload = pruneMissingColumnFromPayload(insertPayload, error || {});
    if (nextPayload) {
      insertPayload = nextPayload;
      continue;
    }

    throw new Error(error?.message || 'Failed to create category');
  }
};

const updateCategoryRow = async (id: string, payload: Record<string, unknown>): Promise<void> => {
  let updatePayload = { ...payload };

  while (Object.keys(updatePayload).length > 0) {
    const { error } = await (supabase as any)
      .from('categories')
      .update(updatePayload)
      .eq('id', id);

    if (!error) return;

    const nextPayload = pruneMissingColumnFromPayload(updatePayload, error || {});
    if (nextPayload) {
      updatePayload = nextPayload;
      continue;
    }

    throw new Error(error.message || 'Failed to update category');
  }
};

const ensureDefaultHierarchyIfEmpty = async (): Promise<void> => {
  const { count, error } = await (supabase as any)
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .is('parent_id', null);

  if (error) {
    throw new Error(error.message || 'Failed to inspect categories table');
  }

  if ((count || 0) > 0) {
    return;
  }

  const parentEntries = Object.entries(DEFAULT_CATEGORY_TREE);

  for (let categoryIndex = 0; categoryIndex < parentEntries.length; categoryIndex += 1) {
    const [categoryName, subcategories] = parentEntries[categoryIndex];
    const categoryIcon = CATEGORY_ICON_FALLBACK[categoryName] || 'folder';

    const parentRow = await insertCategoryRow({
      name: categoryName,
      icon: categoryIcon,
      parent_id: null,
      sort_order: categoryIndex + 1,
      is_active: true,
    });

    if (!subcategories.length) continue;

    const subRows = subcategories.map((subcategory, subIndex) => ({
      name: subcategory.name,
      parent_id: parentRow.id,
      icon: subcategory.icon || 'label',
      sort_order: subIndex + 1,
      is_active: true,
    }));

    for (const subRow of subRows) {
      await insertCategoryRow(subRow);
    }
  }
};

const updateSortOrders = async (items: Array<{ id: string; sortOrder: number }>): Promise<void> => {
  if (items.length === 0) return;

  for (const { id, sortOrder } of items) {
    try {
      await updateCategoryRow(id, { sort_order: sortOrder });
    } catch (error: any) {
      if (MISSING_COLUMN_REGEX.test(error?.message || '')) {
        return;
      }
      throw error;
    }
  }
};

export const categoryManagementService = {
  async getTree(options: GetTreeOptions = {}): Promise<AdminCategoryNode[]> {
    const { seedDefaults = true } = options;

    try {
      if (seedDefaults) {
        await ensureDefaultHierarchyIfEmpty();
      }

      const rows = await fetchCategoryRows();
      return mapRowsToTree(rows);
    } catch (error) {
      logger.error('Failed to load admin category tree:', error);
      throw error;
    }
  },

  async seedDefaults(): Promise<void> {
    await ensureDefaultHierarchyIfEmpty();
  },

  async createCategory(payload: UpsertCategoryInput): Promise<void> {
    await insertCategoryRow({
      name: payload.name.trim(),
      icon: payload.icon || 'folder',
      parent_id: payload.parentId ?? null,
      sort_order: payload.sortOrder,
      is_active: payload.isActive !== false,
    });
  },

  async updateCategory(
    id: string,
    payload: Partial<{ name: string; icon: string; sortOrder: number; isActive: boolean; parentId: string | null }>
  ): Promise<void> {
    const updatePayload: Record<string, unknown> = {};

    if (payload.name !== undefined) updatePayload.name = payload.name.trim();
    if (payload.icon !== undefined) updatePayload.icon = payload.icon;
    if (payload.sortOrder !== undefined) updatePayload.sort_order = payload.sortOrder;
    if (payload.isActive !== undefined) updatePayload.is_active = payload.isActive;
    if (payload.parentId !== undefined) updatePayload.parent_id = payload.parentId;

    await updateCategoryRow(id, updatePayload);
  },

  async deleteCategory(id: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('categories')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(error.message || 'Failed to delete category');
    }
  },

  async deleteCategoryWithChildren(id: string): Promise<void> {
    const { error: childDeleteError } = await (supabase as any)
      .from('categories')
      .delete()
      .eq('parent_id', id);

    if (childDeleteError) {
      throw new Error(childDeleteError.message || 'Failed to delete subcategories');
    }

    await this.deleteCategory(id);
  },

  async updateSortOrders(items: Array<{ id: string; sortOrder: number }>): Promise<void> {
    await updateSortOrders(items);
  },
};
