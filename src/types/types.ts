import { PaymentStatus } from './payment';
export { PaymentStatus };

export enum UserRole {
  GUEST = 'GUEST',
  CLIENT = 'CLIENT',
  SUPPLIER = 'SUPPLIER',
  ADMIN = 'ADMIN',
}

export interface PaymentSettings {
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  iban?: string;
  swiftCode?: string;
  paymentMethod?: 'BANK_TRANSFER' | 'CHECK' | 'PAYPAL';
}

export type SupplierPaymentSettings = PaymentSettings;

export interface SupplierFinancials {
  totalEarnings: number;
  pendingPayouts: number;
  completedOrders: number;
  averageOrderValue: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyName: string;
  verified: boolean;
  // For anonymization
  publicId?: string;
  rating?: number;
  // Profile
  profilePicture?: string;
  // Supplier Management Fields
  status?: 'APPROVED' | 'PENDING' | 'REJECTED' | 'REQUIRES_ATTENTION' | 'ACTIVE' | 'DEACTIVATED';
  kycStatus?: 'VERIFIED' | 'IN_REVIEW' | 'REJECTED' | 'INCOMPLETE';
  dateJoined?: string;
  // Financial Fields
  creditLimit?: number;
  clientMargin?: number;
  creditUsed?: number;
  phone?: string;
  paymentSettings?: SupplierPaymentSettings;
  kycDocuments?: Record<string, string>;
}

export type CreditLimitAdjustmentType = 'SET' | 'INCREASE' | 'DECREASE';

export interface CreditLimitAdjustment {
  id: string;
  clientId: string;
  adminId: string;
  adjustmentType: CreditLimitAdjustmentType;
  adjustmentAmount: number;
  changeAmount: number;
  previousLimit: number;
  newLimit: number;
  reason: string;
  createdAt: string;
  adminName?: string;
}

export interface Product {
  id: string;
  supplierId: string;
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  image: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  supplierPrice?: number; // Price set by the supplier (mapped from cost_price in DB)
  retailPrice?: number; // Price clients see (cost + margin)
  marginPercent?: number; // MWRD's margin percentage
  sku?: string;
  stock?: number; // Available stock quantity
  brand?: string; // Brand from Master Product or manually entered
  createdAt?: string;
  updatedAt?: string;
}

export interface RFQItem {
  productId: string;
  quantity: number;
  notes: string;
  flexibility?: 'EXACT' | 'OPEN_TO_EQUIVALENT' | 'OPEN_TO_ALTERNATIVES';
}

export interface RFQ {
  id: string;
  clientId: string;
  items: RFQItem[];
  status: 'OPEN' | 'QUOTED' | 'CLOSED';
  date: string;
  createdAt: string; // ISO timestamp for auto-quote timer
  autoQuoteTriggered?: boolean;
  validUntil?: string;
  deliveryLocation?: string;
  desiredDeliveryDate?: string;
  expiryDate?: string;
  flexibility?: 'EXACT' | 'OPEN_TO_EQUIVALENT' | 'OPEN_TO_ALTERNATIVES';
  generalRequirements?: string;
  title?: string;
}

export interface SystemConfig {
  autoQuoteDelayMinutes: number;
  defaultMarginPercent: number;
  lastAutoQuoteCheck?: string;
  autoQuoteEnabled?: boolean;
  autoQuoteIncludeLimitedStock?: boolean;
  autoQuoteLeadTimeDays?: number;
  rfqDefaultExpiryDays?: number;
}

export interface Quote {
  id: string;
  rfqId: string;
  supplierId: string;
  supplierPrice: number; // Price supplier sets
  leadTime: string;
  marginPercent: number; // Admin sets this
  finalPrice: number; // Price client sees (supplierPrice + margin)
  status: 'PENDING_ADMIN' | 'SENT_TO_CLIENT' | 'ACCEPTED' | 'REJECTED';
  type?: 'auto' | 'custom';
  notes?: string;
  shippingCost?: number;
  tax?: number;
  quoteItems?: QuoteItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface QuoteItem {
  id: string;
  productId: string;
  productName: string;
  brand?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  leadTime?: string;
  notes?: string;
  isAlternative: boolean;
  alternativeProductName?: string;
}

export enum OrderStatus {
  PENDING_ADMIN_CONFIRMATION = 'PENDING_ADMIN_CONFIRMATION',
  CONFIRMED = 'CONFIRMED',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  PROCESSING = 'PROCESSING',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  PICKUP_SCHEDULED = 'PICKUP_SCHEDULED',
  PICKED_UP = 'PICKED_UP',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  SHIPPED = 'SHIPPED', // Deprecated in favor of OUT_FOR_DELIVERY, kept for backward compat if needed
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  COMPLETED = 'COMPLETED',
  DISPUTED = 'DISPUTED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export type PaymentAuditAction =
  | 'REFERENCE_SUBMITTED'
  | 'REFERENCE_RESUBMITTED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_REJECTED';

export interface PaymentAuditLog {
  id: string;
  orderId: string;
  actorUserId?: string;
  actorRole?: UserRole;
  action: PaymentAuditAction;
  fromStatus?: OrderStatus;
  toStatus?: OrderStatus;
  paymentReference?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type POAuditAction =
  | 'PO_GENERATED'
  | 'CLIENT_PO_CONFIRMED'
  | 'CLIENT_PO_UPLOADED'
  | 'PO_VERIFIED'
  | 'PO_REJECTED';

export interface POAuditLog {
  id: string;
  orderId: string;
  documentId?: string;
  actorUserId: string;
  actorRole: UserRole;
  action: POAuditAction;
  metadata?: Record<string, unknown>;
  notes?: string;
  createdAt: string;
}

export interface ShipmentDetails {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string;
  estimatedDeliveryDate?: string;
  shippedDate: string;
  notes?: string;
}

export interface Order {
  id: string;
  quoteId?: string;
  system_po_number?: string;
  clientId: string;
  supplierId: string;
  amount: number;
  status: OrderStatus;
  paymentStatus?: PaymentStatus;
  date: string;
  paymentReference?: string;
  paymentConfirmedAt?: string;
  paymentConfirmedBy?: string;
  paymentNotes?: string;
  paymentReceiptUrl?: string;
  paymentSubmittedAt?: string;
  paymentLinkUrl?: string;
  paymentLinkSentAt?: string;

  // Logistics
  shipment?: ShipmentDetails;
  // Pickup details (visible to suppliers)
  pickupDetails?: {
    driverName?: string;
    driverContact?: string;
    scheduledPickupTime?: string;
    pickupNotes?: string;
  };

  // PO & Verification Flow
  system_po_generated?: boolean;
  client_po_uploaded?: boolean;
  admin_verified?: boolean;
  admin_verified_by?: string;
  admin_verified_at?: string;
  not_test_order_confirmed_at?: string;
  payment_terms_confirmed_at?: string;
  client_po_confirmation_submitted_at?: string;

  items?: any; // JSON structure for order items

  createdAt?: string;
  updatedAt?: string;
}

export interface AppNotification {
  id: string;
  type: 'rfq' | 'quote' | 'order' | 'payment' | 'system';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string;
}

export interface BankDetails {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban?: string;
  swiftCode?: string;
  branchName?: string;
  branchCode?: string;
  currency: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export enum CustomRequestStatus {
  PENDING = 'PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  ASSIGNED = 'ASSIGNED',
  QUOTED = 'QUOTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum RequestPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export interface CustomItemRequest {
  id: string;
  clientId: string;
  // Request details
  itemName: string;
  description: string;
  specifications?: string;
  category?: string;
  // Quantity and pricing
  quantity: number;
  targetPrice?: number;
  currency: string;
  // Additional info
  deadline?: string;
  priority: RequestPriority;
  referenceImages?: string[];
  attachmentUrls?: string[];
  // Status tracking
  status: CustomRequestStatus;
  adminNotes?: string;
  assignedTo?: string;
  assignedAt?: string;
  assignedBy?: string;
  // Response
  supplierQuoteId?: string;
  respondedAt?: string;
  rejectionReason?: string;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface LogisticsProvider {
  id: string;
  name: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  serviceAreas: string[];
  isActive: boolean;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierPayout {
  id: string;
  supplierId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PROCESSING' | 'PAID' | 'FAILED';
  paymentMethod?: string;
  referenceNumber?: string;
  paidAt?: string;
  createdBy?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AppState {
  currentUser: User | null;
}
