import { logger } from '@/src/utils/logger';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  User,
  Product,
  RFQ,
  Quote,
  Order,
  AppNotification,
  UserRole,
  SystemConfig,
  OrderStatus,
  CreditLimitAdjustment,
  CreditLimitAdjustmentType
} from '../types/types';
import { autoQuoteService } from '../services/autoQuoteService';
import { authService } from '../services/authService';
import { api } from '../services/api';
import { appConfig } from '../config/appConfig';
import { initializeStorage } from '../utils/storage';
import { supabase } from '../lib/supabase';

// Initialize and validate storage before creating store
initializeStorage();

// Use centralized config for mode detection
const USE_SUPABASE = appConfig.features.useDatabase && appConfig.supabase.isConfigured;
const DEFAULT_PAGE_SIZE = 100;
const MOCK_LOGIN_PASSWORD = String(import.meta.env.VITE_MOCK_AUTH_PASSWORD || '').trim();
const SESSION_WARNING_LEAD_SECONDS = 10 * 60;

let sessionExpiryWarningTimer: ReturnType<typeof setTimeout> | null = null;

const clearSessionExpiryWarningTimer = () => {
  if (sessionExpiryWarningTimer) {
    clearTimeout(sessionExpiryWarningTimer);
    sessionExpiryWarningTimer = null;
  }
};

const scheduleSessionExpiryWarning = (
  expiresAtSeconds: number | undefined,
  onWarn: () => void
) => {
  clearSessionExpiryWarningTimer();
  if (!expiresAtSeconds || !Number.isFinite(expiresAtSeconds)) return;

  const triggerAtMs = (expiresAtSeconds * 1000) - (SESSION_WARNING_LEAD_SECONDS * 1000);
  const delayMs = triggerAtMs - Date.now();
  if (!Number.isFinite(delayMs) || delayMs <= 0) return;

  sessionExpiryWarningTimer = setTimeout(() => {
    onWarn();
    sessionExpiryWarningTimer = null;
  }, delayMs);
};

type MockSeedData = {
  USERS: User[];
  PRODUCTS: Product[];
  RFQS: RFQ[];
  QUOTES: Quote[];
  ORDERS: Order[];
};

let mockSeedDataPromise: Promise<MockSeedData> | null = null;

const loadMockSeedData = async (): Promise<MockSeedData> => {
  if (!import.meta.env.DEV) {
    // Do not ship demo users/data as active runtime data in production bundles.
    return {
      USERS: [],
      PRODUCTS: [],
      RFQS: [],
      QUOTES: [],
      ORDERS: [],
    };
  }

  if (!mockSeedDataPromise) {
    mockSeedDataPromise = import('../services/mockData').then((module) => ({
      USERS: module.USERS,
      PRODUCTS: module.PRODUCTS,
      RFQS: module.RFQS,
      QUOTES: module.QUOTES,
      ORDERS: module.ORDERS,
    }));
  }

  return mockSeedDataPromise;
};

interface StoreState {
  // Auth
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // Data
  users: User[];
  products: Product[];
  rfqs: RFQ[];
  quotes: Quote[];
  orders: Order[];
  creditLimitAdjustments: CreditLimitAdjustment[];
  notifications: AppNotification[];

  // Actions
  login: (email: string, password: string) => Promise<User | null>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>;

  // Product actions
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  approveProduct: (id: string) => Promise<void>;
  rejectProduct: (id: string) => Promise<void>;

  // RFQ actions
  addRFQ: (rfq: RFQ) => Promise<void>;
  updateRFQ: (id: string, updates: Partial<RFQ>) => Promise<void>;

  // Quote actions
  addQuote: (quote: Quote) => Promise<void>;
  updateQuote: (id: string, updates: Partial<Quote>) => Promise<void>;
  approveQuote: (id: string, marginPercent: number) => Promise<void>;
  acceptQuote: (id: string) => Promise<void>;
  rejectQuote: (id: string) => Promise<void>;

  // Order actions
  addOrder: (order: Order) => void;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<Order | null>;

  // User management
  updateUser: (id: string, updates: Partial<User>) => Promise<User | null>;
  adjustClientCreditLimit: (
    clientId: string,
    adjustmentType: CreditLimitAdjustmentType,
    adjustmentAmount: number,
    reason: string
  ) => Promise<{ user: User | null; adjustment: CreditLimitAdjustment | null; error?: string }>;
  setClientMargin: (clientId: string, margin: number) => Promise<{ success: boolean; error?: string }>;
  setRFQMargin: (rfqId: string, margin: number) => Promise<{ success: boolean; error?: string }>;
  getClientCreditLimitAdjustments: (clientId: string, limit?: number) => Promise<CreditLimitAdjustment[]>;
  approveSupplier: (id: string) => Promise<void>;
  rejectSupplier: (id: string) => Promise<void>;
  setProfilePicture: (imageUrl: string) => void;

  // Data loading (for Supabase)
  loadProducts: () => Promise<void>;
  loadRFQs: () => Promise<void>;
  loadQuotes: () => Promise<void>;
  loadOrders: () => Promise<void>;
  loadUsers: () => Promise<void>;

  addUser: (userData: any) => Promise<void>;

  // Notifications
  addNotification: (notification: Omit<AppNotification, 'id' | 'createdAt' | 'isRead'>) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // System Configuration
  systemConfig: SystemConfig;
  updateSystemConfig: (updates: Partial<SystemConfig>) => Promise<boolean>;
  triggerAutoQuoteCheck: () => void;
  loadSystemConfig: () => Promise<void>;

  // Margin Settings
  marginSettings: { category: string | null; marginPercent: number; isDefault: boolean }[];
  loadMarginSettings: () => Promise<void>;
  updateMarginSetting: (category: string | null, marginPercent: number) => Promise<boolean>;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentUser: null,
      isAuthenticated: false,
      isLoading: true,
      users: [],
      products: [],
      rfqs: [],
      quotes: [],
      orders: [],
      creditLimitAdjustments: [],
      notifications: [],

      // Default System Config
      systemConfig: {
        autoQuoteDelayMinutes: 30, // 30 minutes default
        defaultMarginPercent: 10,   // 10% default margin
        autoQuoteEnabled: true,     // Auto-quote enabled by default
        autoQuoteIncludeLimitedStock: false,
        rfqDefaultExpiryDays: 7,
      },
      marginSettings: [],


      // Initialize auth state from Supabase session
      initializeAuth: async () => {
        if (appConfig.debug.logAuthFlow) {
          logger.auth('Initializing authentication');
        }

        if (USE_SUPABASE) {
          set({ isLoading: true });

          if (appConfig.debug.logAuthFlow) {
            logger.auth('Checking for existing Supabase session');
          }

          const { user } = await authService.getSession();

          if (user) {
            if (appConfig.debug.logAuthFlow) {
              logger.auth('Found existing session', {
                userName: user.name,
                role: user.role
              });
            }

            set({ currentUser: user, isAuthenticated: true, isLoading: false });

            const { data: sessionData } = await supabase.auth.getSession();
            scheduleSessionExpiryWarning(sessionData.session?.expires_at, () => {
              get().addNotification({
                type: 'system',
                title: 'Session expiring soon',
                message: 'Your session will expire in about 10 minutes. Please save your work.',
              });
            });

            // Load data for authenticated user
            const bootstrapTasks: Promise<unknown>[] = [
              get().loadProducts(),
              get().loadRFQs(),
              get().loadQuotes(),
              get().loadOrders(),
            ];
            if (user.role === 'ADMIN') {
              bootstrapTasks.push(
                get().loadUsers(),
                get().loadSystemConfig(),
                get().loadMarginSettings()
              );
            }
            void Promise.allSettled(bootstrapTasks).then((results) => {
              const failedCount = results.filter((result) => result.status === 'rejected').length;
              if (failedCount > 0) {
                logger.error('Failed to bootstrap authenticated user data after session restore', {
                  failedCount,
                });
              }
            });
          } else {
            if (appConfig.debug.logAuthFlow) {
              logger.auth('No existing session found');
            }
            clearSessionExpiryWarningTimer();
            set({ currentUser: null, isAuthenticated: false, isLoading: false });
          }
        } else {
          if (appConfig.debug.logAuthFlow) {
            logger.auth('Mock mode enabled - skipping Supabase session check');
          }

          const mockData = await loadMockSeedData();
          set((state) => ({
            users: state.users.length ? state.users : mockData.USERS,
            products: state.products.length ? state.products : mockData.PRODUCTS,
            rfqs: state.rfqs.length ? state.rfqs : mockData.RFQS,
            quotes: state.quotes.length ? state.quotes : mockData.QUOTES,
            orders: state.orders.length ? state.orders : mockData.ORDERS,
            isLoading: false
          }));
        }
      },

      // Auth actions
      login: async (email: string, password: string) => {
        if (appConfig.debug.logAuthFlow) {
          logger.auth('Login attempt', {
            email,
            mode: USE_SUPABASE ? 'SUPABASE' : 'MOCK'
          });
        }

        if (USE_SUPABASE) {
          // Supabase authentication
          if (appConfig.debug.logAuthFlow) {
            logger.auth('Using Supabase authentication');
          }

          const result = await authService.signIn(email, password);

          if (result.success && result.user) {
            if (appConfig.debug.logAuthFlow) {
              logger.auth('Supabase authentication successful', {
                userName: result.user.name,
                role: result.user.role
              });
            }

            set({ currentUser: result.user, isAuthenticated: true });

            scheduleSessionExpiryWarning(result.session?.expires_at, () => {
              get().addNotification({
                type: 'system',
                title: 'Session expiring soon',
                message: 'Your session will expire in about 10 minutes. Please save your work.',
              });
            });

            // Load data for authenticated user
            const bootstrapTasks: Promise<unknown>[] = [
              get().loadProducts(),
              get().loadRFQs(),
              get().loadQuotes(),
              get().loadOrders(),
            ];
            if (result.user.role === 'ADMIN') {
              bootstrapTasks.push(
                get().loadUsers(),
                get().loadSystemConfig(),
                get().loadMarginSettings()
              );
            }
            void Promise.allSettled(bootstrapTasks).then((results) => {
              const failedCount = results.filter((result) => result.status === 'rejected').length;
              if (failedCount > 0) {
                logger.error('Failed to bootstrap authenticated user data after login', {
                  failedCount,
                });
              }
            });
            return result.user;
          }

          if (appConfig.debug.logAuthFlow) {
            logger.auth('Supabase authentication failed', { error: result.error });
          }
          return null;
        } else {
          // Mock authentication implementation for audit/dev
          if (appConfig.debug.logAuthFlow) {
            logger.auth('Using mock authentication');
          }

          if (!import.meta.env.DEV && !appConfig.features.allowProdMockMode) {
            logger.warn('Mock authentication is disabled outside development');
            return null;
          }

          const mockData = await loadMockSeedData();

          // Find user by email
          const user = mockData.USERS.find(u => u.email.toLowerCase() === email.toLowerCase());

          if (user) {
            if (!MOCK_LOGIN_PASSWORD) {
              logger.warn('Mock authentication password is not configured. Set VITE_MOCK_AUTH_PASSWORD for mock-mode login.');
              return null;
            }

            if (password === MOCK_LOGIN_PASSWORD) {
              if (appConfig.debug.logAuthFlow) {
                logger.auth('Mock authentication successful', { userName: user.name });
              }

              set({ currentUser: user, isAuthenticated: true, isLoading: false });

              // Ensure mock data is loaded
              set(state => ({
                products: state.products.length ? state.products : mockData.PRODUCTS,
                rfqs: state.rfqs.length ? state.rfqs : mockData.RFQS,
                quotes: state.quotes.length ? state.quotes : mockData.QUOTES,
                orders: state.orders.length ? state.orders : mockData.ORDERS,
                users: state.users.length ? state.users : mockData.USERS
              }));

              return user;
            } else {
              if (appConfig.debug.logAuthFlow) {
                logger.auth('Mock authentication failed: invalid password');
              }
            }
          } else {
            if (appConfig.debug.logAuthFlow) {
              logger.auth('Mock authentication failed: user not found');
            }
          }
          return null;
        }
      },

      logout: async () => {
        if (USE_SUPABASE) {
          await authService.signOut();
        }
        clearSessionExpiryWarningTimer();
        set({ currentUser: null, isAuthenticated: false });
      },

      // Data loading functions for Supabase
      loadProducts: async () => {
        if (USE_SUPABASE) {
          try {
            const products = await api.getProducts(undefined, { page: 1, pageSize: DEFAULT_PAGE_SIZE });
            set({ products });
          } catch (err) {
            logger.error('Failed to load products:', err);
            throw (err instanceof Error ? err : new Error('Failed to load products'));
          }
        }
      },

      loadRFQs: async () => {
        if (USE_SUPABASE) {
          try {
            const user = get().currentUser;
            const filters: any = {};

            if (user?.role === UserRole.CLIENT) {
              filters.clientId = user.id;
            } else if (user?.role === UserRole.SUPPLIER) {
              filters.supplierId = user.id;
            }

            const rfqs = await api.getRFQs(filters, { page: 1, pageSize: DEFAULT_PAGE_SIZE });
            set({ rfqs });
          } catch (err) {
            logger.error('Failed to load RFQs:', err);
            throw (err instanceof Error ? err : new Error('Failed to load RFQs'));
          }
        }
      },

      loadQuotes: async () => {
        if (USE_SUPABASE) {
          try {
            const user = get().currentUser;
            const filters: any = {};

            if (user?.role === UserRole.SUPPLIER) {
              filters.supplierId = user.id;
            }

            let quotes = await api.getQuotes(filters, { page: 1, pageSize: DEFAULT_PAGE_SIZE });

            // For client users, if the general query returned nothing, try fetching quotes via the client's RFQs
            if (user?.role === UserRole.CLIENT && quotes.length === 0) {
              // Try to get client's RFQs from store, or load them directly
              let clientRfqIds: string[] = get().rfqs
                .filter(rfq => rfq.clientId === user.id)
                .map(rfq => rfq.id);

              if (clientRfqIds.length === 0) {
                // RFQs may not be loaded yet (parallel bootstrap) - fetch directly
                const clientRfqs = await api.getRFQs({ clientId: user.id }, { page: 1, pageSize: DEFAULT_PAGE_SIZE });
                clientRfqIds = clientRfqs.map(rfq => rfq.id);
              }

              if (clientRfqIds.length > 0) {
                const rfqQuotes = await Promise.all(
                  clientRfqIds.map(rfqId => api.getQuotes({ rfqId }, { page: 1, pageSize: DEFAULT_PAGE_SIZE }))
                );
                quotes = rfqQuotes.flat();
              }
            }

            set({ quotes });
          } catch (err) {
            logger.error('Failed to load quotes:', err);
            throw (err instanceof Error ? err : new Error('Failed to load quotes'));
          }
        }
      },

      loadOrders: async () => {
        if (USE_SUPABASE) {
          try {
            const user = get().currentUser;
            const filters: any = {};

            if (user?.role === UserRole.CLIENT) {
              filters.clientId = user.id;
            } else if (user?.role === UserRole.SUPPLIER) {
              filters.supplierId = user.id;
            }

            const orders = await api.getOrders(filters, { page: 1, pageSize: DEFAULT_PAGE_SIZE });
            set({ orders });
          } catch (err) {
            logger.error('Failed to load orders:', err);
            throw (err instanceof Error ? err : new Error('Failed to load orders'));
          }
        }
      },

      loadUsers: async () => {
        if (USE_SUPABASE) {
          try {
            const pageSize = 200;
            let page = 1;
            let users: User[] = [];
            while (page <= 20) {
              const batch = await api.getUsers({ page, pageSize });
              if (batch.length === 0) break;
              users = [...users, ...batch];
              if (batch.length < pageSize) break;
              page += 1;
            }

            if (users.length === 0) {
              const [clients, suppliers] = await Promise.all([
                api.getUsersByRole(UserRole.CLIENT, { page: 1, pageSize }),
                api.getUsersByRole(UserRole.SUPPLIER, { page: 1, pageSize }),
              ]);
              const currentUser = get().currentUser;
              users = Array.from(
                new Map(
                  [...clients, ...suppliers, ...(currentUser ? [currentUser] : [])]
                    .map((user) => [user.id, user])
                ).values()
              );
            }

            set({ users });
          } catch (err) {
            logger.error('Failed to load users:', err);
            throw (err instanceof Error ? err : new Error('Failed to load users'));
          }
        }
      },

      // Product actions
      addProduct: async (product: Product) => {
        if (USE_SUPABASE) {
          try {
            const newProduct = await api.createProduct(product);
            if (!newProduct) {
              throw new Error('Product creation returned no data');
            }
            set(state => ({ products: [...state.products, newProduct] }));
          } catch (error) {
            logger.error('Failed to add product:', error);
            throw (error instanceof Error ? error : new Error('Failed to add product'));
          }
          return;
        } else {
          set(state => ({
            products: [...state.products, product]
          }));
        }
      },

      updateProduct: async (id: string, updates: Partial<Product>) => {
        if (USE_SUPABASE) {
          try {
            const updatedProduct = await api.updateProduct(id, updates);
            if (!updatedProduct) {
              throw new Error('Product update returned no data');
            }
            set(state => ({
              products: state.products.map(p =>
                p.id === id ? updatedProduct : p
              )
            }));
          } catch (error) {
            logger.error('Failed to update product:', error);
            throw (error instanceof Error ? error : new Error('Failed to update product'));
          }
          return;
        } else {
          set(state => ({
            products: state.products.map(p =>
              p.id === id ? { ...p, ...updates } : p
            )
          }));
        }
      },

      deleteProduct: async (id: string) => {
        if (USE_SUPABASE) {
          try {
            const success = await api.deleteProduct(id);
            if (!success) {
              throw new Error('Product deletion failed');
            }
            set(state => ({
              products: state.products.filter(p => p.id !== id)
            }));
          } catch (error) {
            logger.error('Failed to delete product:', error);
            throw (error instanceof Error ? error : new Error('Failed to delete product'));
          }
          return;
        } else {
          set(state => ({
            products: state.products.filter(p => p.id !== id)
          }));
        }
      },

      approveProduct: async (id: string) => {
        await get().updateProduct(id, { status: 'APPROVED' });
      },

      rejectProduct: async (id: string) => {
        await get().updateProduct(id, { status: 'REJECTED' });
      },

      // RFQ actions
      addRFQ: async (rfq: RFQ) => {
        if (USE_SUPABASE) {
          try {
            const newRfq = await api.createRFQ(rfq);
            if (newRfq) {
              set(state => ({ rfqs: [...state.rfqs, newRfq] }));
              return;
            }
            throw new Error('Unable to create RFQ. Please check required fields and try again.');
          } catch (err) {
            logger.error('Failed to create RFQ:', err);
            throw err;
          }
        } else {
          set(state => ({
            rfqs: [...state.rfqs, rfq]
          }));
        }
      },

      updateRFQ: async (id: string, updates: Partial<RFQ>) => {
        if (USE_SUPABASE) {
          try {
            const updatedRfq = await api.updateRFQ(id, updates);
            if (!updatedRfq) {
              throw new Error('RFQ update returned no data');
            }
            set(state => ({
              rfqs: state.rfqs.map(r =>
                r.id === id ? updatedRfq : r
              )
            }));
          } catch (error) {
            logger.error('Failed to update RFQ:', error);
            throw (error instanceof Error ? error : new Error('Failed to update RFQ'));
          }
          return;
        } else {
          set(state => ({
            rfqs: state.rfqs.map(r =>
              r.id === id ? { ...r, ...updates } : r
            )
          }));
        }
      },

      // Quote actions
      addQuote: async (quote: Quote) => {
        if (USE_SUPABASE) {
          try {
            const newQuote = await api.createQuote(quote);
            if (!newQuote) {
              throw new Error('Quote creation returned no data');
            }
            set(state => ({ quotes: [...state.quotes, newQuote] }));
          } catch (error) {
            logger.error('Failed to add quote:', error);
            throw (error instanceof Error ? error : new Error('Failed to add quote'));
          }
          return;
        } else {
          set(state => ({
            quotes: [...state.quotes, quote]
          }));
        }
      },

      updateQuote: async (id: string, updates: Partial<Quote>) => {
        if (USE_SUPABASE) {
          try {
            const updatedQuote = await api.updateQuote(id, updates);
            if (!updatedQuote) {
              throw new Error('Quote update returned no data');
            }
            set(state => ({
              quotes: state.quotes.map(q =>
                q.id === id ? updatedQuote : q
              )
            }));
          } catch (error) {
            logger.error('Failed to update quote:', error);
            throw (error instanceof Error ? error : new Error('Failed to update quote'));
          }
          return;
        } else {
          set(state => ({
            quotes: state.quotes.map(q =>
              q.id === id ? { ...q, ...updates } : q
            )
          }));
        }
      },

      approveQuote: async (id: string, marginPercent: number) => {
        if (USE_SUPABASE) {
          try {
            const updatedQuote = await api.approveQuote(id, marginPercent);
            if (!updatedQuote) {
              throw new Error('Quote approval returned no data');
            }
            set(state => ({
              quotes: state.quotes.map(q =>
                q.id === id ? updatedQuote : q
              )
            }));
          } catch (error) {
            logger.error('Failed to approve quote:', error);
            throw (error instanceof Error ? error : new Error('Failed to approve quote'));
          }
          return;
        } else {
          const quote = get().quotes.find(q => q.id === id);
          if (quote) {
            const finalPrice = quote.supplierPrice * (1 + marginPercent / 100);
            await get().updateQuote(id, {
              marginPercent,
              finalPrice,
              status: 'SENT_TO_CLIENT'
            });
          }
        }
      },

      acceptQuote: async (id: string) => {
        if (USE_SUPABASE) {
          try {
            const result = await api.acceptQuote(id);
            if (result.quote) {
              set(state => ({
                quotes: state.quotes.map(q =>
                  q.id === id ? result.quote! : q
                )
              }));
            }
            if (result.order) {
              set(state => ({
                orders: [...state.orders, result.order!]
              }));
            }
            // Update RFQ status
            const quote = get().quotes.find(q => q.id === id);
            if (quote) {
              set(state => ({
                rfqs: state.rfqs.map(r =>
                  r.id === quote.rfqId ? { ...r, status: 'CLOSED' as const } : r
                )
              }));
            }
          } catch (error) {
            logger.error('Failed to accept quote:', error);
            throw (error instanceof Error ? error : new Error('Failed to accept quote'));
          }
          return;
        } else {
          await get().updateQuote(id, { status: 'ACCEPTED' });
          const quote = get().quotes.find(q => q.id === id);
          if (quote) {
            // Update RFQ status
            await get().updateRFQ(quote.rfqId, { status: 'CLOSED' });

            // Find RFQ to get clientId
            const rfq = get().rfqs.find(r => r.id === quote.rfqId);

            // Create order
            const newOrder: Order = {
              id: `ORD-${Date.now()}`,
              amount: quote.finalPrice,
              status: OrderStatus.PENDING_PAYMENT, // Default start status
              date: new Date().toISOString().split('T')[0],
              clientId: rfq?.clientId || 'unknown',
              supplierId: quote.supplierId,
              quoteId: quote.id
            };
            get().addOrder(newOrder);
          }
        }
      },

      rejectQuote: async (id: string) => {
        await get().updateQuote(id, { status: 'REJECTED' });
      },

      // Order actions
      addOrder: (order: Order) => {
        set(state => ({
          orders: [...state.orders, order]
        }));
      },

      updateOrder: async (id: string, updates: Partial<Order>) => {
        if (USE_SUPABASE) {
          const updatedOrder = await api.updateOrder(id, updates);
          if (updatedOrder) {
            set(state => ({
              orders: state.orders.map(o =>
                o.id === id ? updatedOrder : o
              )
            }));
            return updatedOrder;
          }
          return null;
        } else {
          let nextOrder: Order | null = null;
          set(state => ({
            orders: state.orders.map(o =>
              o.id === id
                ? (() => {
                  const updated = { ...o, ...updates };
                  nextOrder = updated;
                  return updated;
                })()
                : o
            )
          }));
          return nextOrder;
        }
      },

      // User management
      updateUser: async (id: string, updates: Partial<User>) => {
        if (USE_SUPABASE) {
          const updatedUser = await api.updateUser(id, updates);
          if (updatedUser) {
            set(state => ({
              users: state.users.map(u =>
                u.id === id ? updatedUser : u
              ),
              currentUser: state.currentUser?.id === id ? updatedUser : state.currentUser
            }));
            return updatedUser;
          }
          return null;
        } else {
          let nextUser: User | null = null;
          set(state => ({
            users: state.users.map(u =>
              u.id === id
                ? (() => {
                  const updated = { ...u, ...updates };
                  nextUser = updated;
                  return updated;
                })()
                : u
            ),
            currentUser: state.currentUser?.id === id
              ? { ...(state.currentUser as User), ...updates }
              : state.currentUser
          }));
          return nextUser;
        }
      },

      adjustClientCreditLimit: async (clientId, adjustmentType, adjustmentAmount, reason) => {
        if (USE_SUPABASE) {
          const result = await api.adjustClientCreditLimit(clientId, adjustmentType, adjustmentAmount, reason);
          if (result.user) {
            set(state => ({
              users: state.users.map((u) => (u.id === clientId ? result.user! : u)),
              creditLimitAdjustments: result.adjustment
                ? [result.adjustment, ...state.creditLimitAdjustments.filter((item) => item.id !== result.adjustment!.id)]
                : state.creditLimitAdjustments
            }));
          }
          return result;
        }

        const currentUser = get().currentUser;
        const targetUser = get().users.find((user) => user.id === clientId);
        if (!targetUser || targetUser.role !== UserRole.CLIENT) {
          return { user: null, adjustment: null, error: 'Client not found' };
        }

        const normalizedAmount = Number(adjustmentAmount);
        const normalizedReason = reason.trim();
        if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) {
          return { user: null, adjustment: null, error: 'Invalid amount' };
        }
        if (normalizedReason.length < 5) {
          return { user: null, adjustment: null, error: 'Reason must be at least 5 characters' };
        }

        const previousLimit = Math.max(0, Number(targetUser.creditLimit || 0));
        let newLimit = previousLimit;

        if (adjustmentType === 'SET') {
          newLimit = normalizedAmount;
        } else if (adjustmentType === 'INCREASE') {
          if (normalizedAmount === 0) {
            return { user: null, adjustment: null, error: 'Increase amount must be greater than zero' };
          }
          newLimit = previousLimit + normalizedAmount;
        } else {
          if (normalizedAmount === 0) {
            return { user: null, adjustment: null, error: 'Decrease amount must be greater than zero' };
          }
          if (normalizedAmount > previousLimit) {
            return { user: null, adjustment: null, error: 'Decrease amount exceeds current credit limit' };
          }
          newLimit = previousLimit - normalizedAmount;
        }

        const roundedNewLimit = Math.round(newLimit * 100) / 100;
        const adjustment: CreditLimitAdjustment = {
          id: `CLA-${Date.now()}`,
          clientId,
          adminId: currentUser?.id || 'SYSTEM',
          adjustmentType,
          adjustmentAmount: Math.round(normalizedAmount * 100) / 100,
          changeAmount: Math.round((roundedNewLimit - previousLimit) * 100) / 100,
          previousLimit,
          newLimit: roundedNewLimit,
          reason: normalizedReason,
          createdAt: new Date().toISOString(),
          adminName: currentUser?.companyName || currentUser?.name
        };

        const updatedUser: User = {
          ...targetUser,
          creditLimit: roundedNewLimit
        };

        set(state => ({
          users: state.users.map((u) => (u.id === clientId ? updatedUser : u)),
          creditLimitAdjustments: [adjustment, ...state.creditLimitAdjustments]
        }));

        return { user: updatedUser, adjustment };
      },

      setClientMargin: async (clientId, margin) => {
        if (!USE_SUPABASE) {
          // Mock implementation
          set(state => ({
            users: state.users.map(u => u.id === clientId ? { ...u, clientMargin: margin } : u)
          }));
          return { success: true };
        }

        const result = await api.setClientMargin(clientId, margin);
        if (result.success) {
          // Refresh user data to get updated margin
          const updatedUser = await api.getUserById(clientId);
          if (updatedUser) {
            set(state => ({
              users: state.users.map(u => u.id === clientId ? updatedUser : u)
            }));
          }
        }
        return result;
      },

      setRFQMargin: async (rfqId, margin) => {
        if (!USE_SUPABASE) {
          // Mock implementation: update local quotes
          set(state => ({
            quotes: state.quotes.map(q => q.rfqId === rfqId ? { ...q, marginPercent: margin } : q)
          }));
          return { success: true };
        }

        const result = await api.setRFQMargin(rfqId, margin);
        if (result.success) {
          // Refresh quotes to see updated margins
          const quotes = await api.getQuotes(undefined, { page: 1, pageSize: DEFAULT_PAGE_SIZE });
          set({ quotes });
        }
        return result;
      },

      getClientCreditLimitAdjustments: async (clientId, limit = 25) => {
        if (USE_SUPABASE) {
          return api.getClientCreditLimitAdjustments(clientId, limit);
        }

        const adjustments = get().creditLimitAdjustments
          .filter((item) => item.clientId === clientId)
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return adjustments.slice(0, limit);
      },

      addUser: async (userData: any) => {
        if (USE_SUPABASE) {
          const newUser = await api.createUser(userData);
          if (newUser) {
            set(state => ({
              users: [newUser, ...state.users]
            }));
            await get().loadUsers(); // Reload to ensure sync
          }
        } else {
          // Mock implementation
          const parsedCreditLimit = Number(userData.creditLimit);
          const newUser: User = {
            id: `USR-${Date.now()}`,
            email: userData.email,
            name: userData.name,
            role: userData.role,
            companyName: userData.companyName,
            verified: false,
            status: userData.role === 'SUPPLIER' ? 'PENDING' : 'ACTIVE',
            kycStatus: 'INCOMPLETE',
            dateJoined: new Date().toISOString().split('T')[0],
            phone: userData.phone,
            creditLimit: userData.role === UserRole.CLIENT && Number.isFinite(parsedCreditLimit)
              ? Math.max(parsedCreditLimit, 0)
              : undefined
          };
          set(state => ({
            users: [newUser, ...state.users]
          }));
        }
      },

      addNotification: (notification) => {
        const timestamp = new Date().toISOString();
        const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `notif-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
        set(state => ({
          notifications: [
            {
              id,
              type: notification.type,
              title: notification.title,
              message: notification.message,
              actionUrl: notification.actionUrl,
              isRead: false,
              createdAt: timestamp,
            },
            ...state.notifications,
          ].slice(0, 200),
        }));
      },

      markNotificationRead: (id) => {
        set(state => ({
          notifications: state.notifications.map((notification) => (
            notification.id === id
              ? { ...notification, isRead: true }
              : notification
          )),
        }));
      },

      markAllNotificationsRead: () => {
        set(state => ({
          notifications: state.notifications.map((notification) => (
            notification.isRead ? notification : { ...notification, isRead: true }
          )),
        }));
      },

      approveSupplier: async (id: string) => {
        if (USE_SUPABASE) {
          try {
            const updatedUser = await api.approveSupplier(id);
            if (!updatedUser) {
              throw new Error('Supplier approval returned no data');
            }
            set(state => ({
              users: state.users.map(u =>
                u.id === id ? updatedUser : u
              )
            }));
          } catch (error) {
            logger.error('Failed to approve supplier:', error);
            throw (error instanceof Error ? error : new Error('Failed to approve supplier'));
          }
          return;
        } else {
          await get().updateUser(id, {
            status: 'APPROVED',
            kycStatus: 'VERIFIED',
            verified: true
          });
        }
      },

      rejectSupplier: async (id: string) => {
        if (USE_SUPABASE) {
          try {
            const updatedUser = await api.rejectSupplier(id);
            if (!updatedUser) {
              throw new Error('Supplier rejection returned no data');
            }
            set(state => ({
              users: state.users.map(u =>
                u.id === id ? updatedUser : u
              )
            }));
          } catch (error) {
            logger.error('Failed to reject supplier:', error);
            throw (error instanceof Error ? error : new Error('Failed to reject supplier'));
          }
          return;
        } else {
          await get().updateUser(id, {
            status: 'REJECTED',
            kycStatus: 'REJECTED'
          });
        }
      },

      setProfilePicture: (imageUrl: string) => {
        const currentUser = get().currentUser;
        if (currentUser) {
          set({
            currentUser: { ...currentUser, profilePicture: imageUrl }
          });
          // Also update in users array
          set(state => ({
            users: state.users.map(u =>
              u.id === currentUser.id ? { ...u, profilePicture: imageUrl } : u
            )
          }));
        }
      },

      // System Actions
      triggerAutoQuoteCheck: async () => {
        if (USE_SUPABASE) {
          try {
            let backendTriggered = false;

            try {
              const response = await fetch('/api/cron/process-auto-quotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
              });
              backendTriggered = response.ok;
            } catch {
              backendTriggered = false;
            }

            if (!backendTriggered) {
              const { error } = await supabase.functions.invoke('process-auto-quotes', {
                body: {},
              });
              if (error) {
                throw error;
              }
              backendTriggered = true;
            }

            if (backendTriggered) {
              await Promise.all([get().loadRFQs(), get().loadQuotes()]);
              return;
            }
          } catch (error) {
            logger.warn('Backend auto-quote trigger failed; using local compatibility flow', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const { rfqs, products, users, quotes, systemConfig, marginSettings } = get();
        const { updatedRfqs, newQuotes } = autoQuoteService.checkAutoQuotes(
          rfqs,
          products,
          users,
          quotes,
          systemConfig,
          marginSettings
        );

        if (updatedRfqs.length > 0) {
          // Update RFQs in local state
          set(state => ({
            rfqs: state.rfqs.map(r => {
              const updated = updatedRfqs.find(u => u.id === r.id);
              return updated ? updated : r;
            })
          }));
          // Persist to Supabase
          if (USE_SUPABASE) {
            for (const rfq of updatedRfqs) {
              await api.updateRFQ(rfq.id, { autoQuoteTriggered: true }).catch(err =>
                logger.error('Failed to persist auto-quote RFQ flag:', err)
              );
            }
          }
        }

        if (newQuotes.length > 0) {
          if (USE_SUPABASE) {
            // Persist each quote to Supabase and use DB-generated IDs
            const persistedQuotes: typeof newQuotes = [];
            for (const q of newQuotes) {
              const saved = await api.createQuote({
                rfqId: q.rfqId,
                supplierId: q.supplierId,
                supplierPrice: q.supplierPrice,
                leadTime: q.leadTime,
                marginPercent: q.marginPercent,
                finalPrice: q.finalPrice,
                status: q.status,
                type: q.type || 'auto',
                quoteItems: q.quoteItems,
              }).catch(err => {
                logger.error('Failed to persist auto-quote:', err);
                return null;
              });
              if (saved) persistedQuotes.push(saved);
            }
            if (persistedQuotes.length > 0) {
              set(state => ({
                quotes: [...state.quotes, ...persistedQuotes]
              }));
            }
          } else {
            // Mock mode: add directly to state
            set(state => ({
              quotes: [...state.quotes, ...newQuotes]
            }));
          }
        }
      },

      loadSystemConfig: async () => {
        if (USE_SUPABASE) {
          try {
            const config = await api.getSystemConfig();
            if (config) {
              set(state => ({ systemConfig: { ...state.systemConfig, ...config } }));
            }
          } catch (err) {
            logger.error('Failed to load system config:', err);
            throw (err instanceof Error ? err : new Error('Failed to load system config'));
          }
        }
      },

      updateSystemConfig: async (updates: Partial<SystemConfig>) => {
        const previousConfig = get().systemConfig;
        const nextConfig = { ...previousConfig, ...updates };

        set({ systemConfig: nextConfig });

        if (USE_SUPABASE) {
          try {
            const success = await api.updateSystemConfig(nextConfig);
            if (!success) {
              set({ systemConfig: previousConfig });
            }
            return success;
          } catch (err) {
            logger.error('Failed to update system config:', err);
            set({ systemConfig: previousConfig });
            return false;
          }
        }

        return true;
      },

      loadMarginSettings: async () => {
        if (USE_SUPABASE) {
          try {
            const settings = await api.getMarginSettings();
            set({ marginSettings: settings });
          } catch (err) {
            logger.error('Failed to load margin settings:', err);
            throw (err instanceof Error ? err : new Error('Failed to load margin settings'));
          }
        }
      },

      updateMarginSetting: async (category: string | null, marginPercent: number): Promise<boolean> => {
        if (USE_SUPABASE) {
          const success = await api.updateMarginSetting(category, marginPercent);
          if (success) {
            await get().loadMarginSettings();
          }
          return success;
        } else {
          // Mock implementation
          set(state => {
            const existingIndex = state.marginSettings.findIndex(m => m.category === category);
            const newSettings = [...state.marginSettings];
            if (existingIndex >= 0) {
              newSettings[existingIndex] = { ...newSettings[existingIndex], marginPercent };
            } else {
              newSettings.push({ category, marginPercent, isDefault: category === null });
            }
            return { marginSettings: newSettings };
          });
          return true;
        }
      },
    }),
    {
      name: 'mwrd-storage',
      partialize: (state) => ({
        currentUser: state.currentUser,
        isAuthenticated: state.isAuthenticated,
        // Only persist mock data if not using Supabase
        ...(USE_SUPABASE ? {} : {
          users: state.users,
          products: state.products,
          rfqs: state.rfqs,
          quotes: state.quotes,
          orders: state.orders,
          creditLimitAdjustments: state.creditLimitAdjustments,
          systemConfig: state.systemConfig,
        }),
        notifications: state.notifications,
      }),
    }
  )
);
