# 📝 OpenAI Codex 5.3 — MWRD Frontend Specialist Assignment

## Your Role
You are a **Frontend React/TypeScript Specialist** working on the MWRD B2B Managed Marketplace Platform. Your job is to implement **13 specific UI gaps** identified in a product-code alignment analysis. You will NOT modify database schemas or write SQL — that work is handled by the database specialist (Antigravity). You will build frontend components, update existing components, and add visual elements that consume APIs already in place (or that you can stub with TODO comments for later integration).

---

## Project Context

### What is MWRD?
MWRD is a B2B managed marketplace SaaS platform acting as a broker between clients and suppliers. Key principles:
- **Anonymity**: Clients see `Supplier-XXXX`, suppliers see `Client-XXXX` — never real names
- **Margin brokerage**: MWRD adds a configurable margin to supplier prices
- **Three portals**: Client, Supplier, Admin — all in one SPA at `/app?tab=<tabName>`
- **Currency**: SAR (Saudi Riyal)

### Tech Stack
- React 18 + TypeScript + Vite
- TailwindCSS (utility-first, no CSS modules)
- Zustand (state management with persist middleware)
- react-i18next (bilingual: English + Arabic)
- Material Symbols Outlined (icon font — use `<span className="material-symbols-outlined">icon_name</span>`)
- Supabase client SDK

### File Structure
```
src/
├── pages/
│   ├── client/ClientPortal.tsx      # Main client view (monolithic, tab-switched)
│   ├── supplier/SupplierPortal.tsx   # Main supplier view
│   └── admin/AdminPortal.tsx        # Main admin view
├── components/
│   ├── admin/views/                 # Admin sub-views (AdminOrdersView, AdminMarginsView, etc.)
│   ├── client/                      # Client sub-components (ClientFinancials)
│   ├── supplier/                    # Supplier sub-components
│   ├── ui/                          # Shared UI (StatusBadge, SearchBar, EmptyState, Toast, etc.)
│   ├── QuoteComparison.tsx          # Quote comparison modal
│   ├── DualPOFlow.tsx               # PO download/upload flow
│   └── PaymentInstructions.tsx      # Bank transfer payment UI
├── services/
│   ├── api.ts                       # Main Supabase API service (singleton)
│   └── [domain]Service.ts           # Specialized services
├── store/useStore.ts                # Zustand global store
├── types/types.ts                   # Core TypeScript interfaces
├── i18n/locales/en.json             # English translations
└── i18n/locales/ar.json             # Arabic translations
```

### Critical Coding Patterns You MUST Follow

#### 1. Component Structure Pattern
```tsx
import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store/useStore';
import { useToast } from '../../hooks/useToast';

interface MyComponentProps {
  someData: string;
  onAction: (id: string) => void;
}

export const MyComponent: React.FC<MyComponentProps> = ({ someData, onAction }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const { currentUser, orders } = useStore();
  const [localState, setLocalState] = useState<string>('');

  // Component logic...

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      {/* Content */}
    </div>
  );
};
```

#### 2. Modal Pattern
```tsx
// Modals are fixed overlays with centered content
<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
  <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto p-6">
    {/* Header */}
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
    {/* Body */}
    {/* Footer with actions */}
  </div>
</div>
```

#### 3. Status Badge Pattern (from StatusBadge.tsx)
```tsx
// Use StatusBadge component or inline badges:
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
  AUTO-QUOTE
</span>
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
  CUSTOM
</span>
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
  NOT QUOTED
</span>
```

#### 4. Table with Filtering Pattern
```tsx
<div className="bg-white rounded-xl shadow-sm border border-gray-200">
  {/* Filters */}
  <div className="p-4 border-b border-gray-200 flex items-center gap-4">
    <input
      type="text"
      placeholder={t('common.search')}
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540] focus:border-transparent outline-none"
    />
    <select className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0A2540]">
      <option value="">{t('common.all')}</option>
      {/* Filter options */}
    </select>
  </div>
  {/* Table */}
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead><tr className="bg-gray-50 border-b">
        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Column</th>
      </tr></thead>
      <tbody>{/* rows */}</tbody>
    </table>
  </div>
</div>
```

#### 5. Toast Notification Pattern
```tsx
toast.success('Operation completed');
toast.error('Something went wrong');
toast.info('FYI message');
```

#### 6. i18n Pattern
```tsx
// Always use translation keys. When adding NEW features, add keys to both en.json and ar.json.
{t('client.quotes.comparison')}
// For new keys, add them with descriptive paths:
// en.json: "client.invoices.title": "Invoices"
// ar.json: "client.invoices.title": "الفواتير"
```

#### 7. Color Palette
- Primary dark: `#0A2540` (buttons, headers)
- Primary blue: `#137fec` (links, accents)
- Success green: `#00C49A` or `bg-green-100 text-green-800`
- Error red: `bg-red-100 text-red-800`
- Warning orange: `bg-orange-100 text-orange-800`
- Info blue: `bg-blue-100 text-blue-800`
- Neutral: `bg-gray-50`, `border-gray-200`, `text-gray-500/600/700/900`

---

## Your Assigned Gaps (13 Items)

### GAP #1 (UI Part): Per-item Quote Pricing Display
**Priority**: Critical
**What to build**: Update `QuoteComparison.tsx` to display per-item pricing when a quote has multiple items.
**Current state**: The comparison shows a single price per supplier. Multi-item RFQs need per-item rows.
**Requirements**:
- For each supplier quote, show a row per item: Product Name | Brand | Unit Price | Quantity | Line Total
- Show a subtotal row at the bottom
- The data structure will have a `quoteItems` array — for now, create the UI assuming this interface:
```typescript
interface QuoteItem {
  id: string;
  productId: string;
  productName: string;
  brand?: string;
  unitPrice: number;       // This is the final (margin-included) price
  quantity: number;
  lineTotal: number;
  isAlternative: boolean;  // If supplier offered alternative
  alternativeProductName?: string;
}
```
- If `quoteItems` is empty/undefined, fall back to the current single-price display
**Acceptance criteria**: Multi-item RFQ quotes show per-item breakdown with unit price, brand, and line totals

### GAP #2 (UI Part): Partial Quote Visual Indicators
**Priority**: Critical
**What to build**: Visual indicators for items NOT quoted by a supplier in a multi-item RFQ.
**Requirements**:
- For items where the supplier did NOT provide a quote: Show `NOT QUOTED` in a RED badge where the price would be
- Show a summary: "2 of 3 items quoted" below the quote
- If client tries to accept a partial quote, show a warning dialog: "This quote doesn't include all items. You'll need to source [item names] separately. Continue?"
- Colors: `bg-red-100 text-red-700` for the NOT QUOTED badge
**Acceptance criteria**: Unquoted items clearly highlighted, summary count shown, warning before accepting partial quotes

### GAP #3/#3a: PO Confirmation Flow with 3-Stage Approval
**Priority**: Critical
**What to build**: Modify the PO approval flow to include:
1. **Stage 1 — Client Confirmation**: After accepting a quote, show a PO review screen with TWO checkboxes:
   - ☑️ "I confirm this is not a test order"
   - ☑️ "I agree to the payment terms"
   - Both must be checked before "Submit for Confirmation" button enables
2. **Stage 2 — Pending Admin**: After client submits, order status becomes `PENDING_ADMIN_CONFIRMATION`. Show client a message: "Your PO is pending verification. MWRD will confirm within 24 hours."
3. **Stage 3 — Admin Confirms**: In the admin portal, add a confirmation step in the PO verification view. Admin clicks "Confirm & Send to Supplier". Status transitions to `CONFIRMED`.
**Current state**: `DualPOFlow.tsx` has a download/upload flow. The Checkout page has one confirmation checkbox.
**Requirements**:
- Log confirmation timestamps (pass as metadata when calling the API)
- Use the existing `DualPOFlow.tsx` component — modify it to add the two checkboxes before the download step
- Add a `PENDING_ADMIN_CONFIRMATION` status display in the client order timeline
**Acceptance criteria**: Two explicit checkboxes required, admin must verify, PO only reaches supplier after admin confirmation

### GAP #5: Invoice List for Clients
**Priority**: Critical
**What to build**: A client-facing invoice list view.
**Current state**: `ClientFinancials.tsx` exists with credit cards and transaction history but no invoice list.
**Requirements**:
- Add an "Invoices" tab/section within the client financials area
- Show a table with columns: Invoice # | Date | Amount (SAR) | Due Date | Status | Actions
- Status badges: `PENDING` (yellow), `PAID` (green), `OVERDUE` (red), `CANCELLED` (gray)
- Action: "View" button opens a detail modal; "Download PDF" button (can be a stub for now)
- For now, fetch from `invoices` table via a new service method. If the table doesn't exist yet, create the component with TODO stubs:
```typescript
// TODO: Replace with actual API call when invoices table is ready
const invoices = await api.getClientInvoices(currentUser.id);
```
**Acceptance criteria**: Client can see all their invoices with status, amounts, and due dates

### GAP #10: Auto-quote vs Custom Quote Badges
**Priority**: High
**What to build**: Visual distinction between auto-generated and manually submitted quotes.
**Requirements**:
- In the `QuoteComparison.tsx`, add a badge next to each quote:
  - `AUTO-QUOTE` — blue badge (`bg-blue-100 text-blue-800`) — system-generated from catalog prices
  - `CUSTOM` — green badge (`bg-green-100 text-green-800`) — supplier manually submitted
- The quote type will be available as `quote.type` field (`'auto'` or `'custom'`). If the field is missing, default to `'custom'` for backward compatibility.
- In the supplier portal RFQ list, if a quote was auto-generated for an RFQ, show an indicator: "Auto-quote submitted for this RFQ"
**Acceptance criteria**: Clients can clearly distinguish auto-generated quotes from custom supplier quotes

### GAP #13: Brand Filter in Client Browse
**Priority**: High
**What to build**: Brand filter in client product browsing.
**Current state**: Client can browse by category and search by keyword, but no brand filtering.
**Requirements**:
- Extract unique brands from products: `const brands = [...new Set(products.map(p => p.brand).filter(Boolean))]`
- Add a brand filter dropdown or chip group above the product grid (after category/subcategory selection)
- When a brand is selected, filter displayed products: `products.filter(p => !selectedBrand || p.brand === selectedBrand)`
- Include an "All Brands" option to clear the filter
- Place it in the `ClientPortal.tsx` browse tab alongside existing category filters
**Acceptance criteria**: Client can filter products by brand, filter persists during category navigation

### GAP #17: Supplier Performance Monitoring (Admin UI)
**Priority**: Medium
**What to build**: Admin dashboard view showing supplier performance metrics.
**Requirements**:
- Create a new admin view component: `AdminSupplierPerformanceView.tsx`
- Show a table of suppliers with columns:
  - Supplier ID (public_id) | Company Name | Quotes Submitted | Quotes Accepted | Win Rate % | Avg Rating | Total Orders | Avg Response Time
- Calculate from existing data:
  - Win rate = (accepted quotes / total quotes) × 100
  - Avg rating = user.rating field
  - Total orders = count of orders for supplier
- Add filters: Date range, min rating, category
- Add to admin sidebar navigation: "Supplier Performance" tab
- For response time: Show "N/A" as placeholder (requires future tracking)
**Acceptance criteria**: Admin can view and compare supplier performance metrics

### GAP #18: Quote Win Rate Metric
**Priority**: Medium
**What to build**: Win rate display on supplier dashboard.
**Requirements**:
- Calculate: `winRate = (quotes.filter(q => q.status === 'ACCEPTED').length / quotes.length) * 100`
- Display as a metric card on the supplier dashboard (alongside existing cards)
- Show: "Quote Win Rate: XX%" with a small trend indicator
- Use the existing metric card style from the supplier dashboard
**Acceptance criteria**: Suppliers can see their quote acceptance ratio

### GAP #20: Credit Utilization Dashboard (Admin)
**Priority**: Medium
**What to build**: Aggregate credit utilization view in admin portal.
**Requirements**:
- Create `AdminCreditUtilizationView.tsx` (or add to existing AdminUsersManagementView)
- Show summary cards: Total Credit Extended | Total Used | Total Available | Utilization %
- Show table of clients: Client-XXXX | Company | Credit Limit | Used | Available | Utilization % | Status
- Color-code utilization: Green (<50%), Yellow (50-80%), Red (>80%)
- Highlight clients with overdue payments (if data available)
**Acceptance criteria**: Admin has a single-view dashboard of all client credit positions

### GAP #21: BEST VALUE Indicator
**Priority**: Medium
**What to build**: Visual indicator on the quote with the best price/value.
**Requirements**:
- In `QuoteComparison.tsx`, identify the quote with the lowest `finalPrice`
- Add a star icon and "BEST VALUE" label: `<span className="material-symbols-outlined text-yellow-500">star</span>`
- Only show if there are 2+ quotes to compare
- Add a subtle highlight border: `border-2 border-yellow-400` on the best value column
**Acceptance criteria**: Best-priced quote is visually highlighted with star icon

### GAP #25: 48h SLA Indicator
**Priority**: Low
**What to build**: Time-since-submission badge on admin product approval queue.
**Current state**: `AdminApprovalsView.tsx` shows pending products but no SLA tracking.
**Requirements**:
- Calculate hours since submission from `createdAt` field
- Show badge: "Xh ago" with color coding:
  - Green: < 24 hours
  - Yellow: 24-48 hours
  - Red: > 48 hours (SLA breached)
- Add as a column in the approvals table
**Acceptance criteria**: Admin can see at a glance which product requests are approaching or past the 48h SLA

### GAP #27: Ready for Pickup Dashboard Widget
**Priority**: Low
**What to build**: Dashboard widget in admin overview showing orders in READY_FOR_PICKUP status.
**Requirements**:
- Add a card/widget to `AdminOverviewView.tsx`
- Query orders where `status === 'READY_FOR_PICKUP'`
- Show count and a list of order IDs with supplier names
- Clicking an order navigates to the orders tab filtered by that order
- Use an attention-grabbing style: `bg-orange-50 border-orange-200`
**Acceptance criteria**: Admin sees a prominent widget for orders needing pickup scheduling

### GAP #32: In-app Notification Center
**Priority**: Low
**What to build**: Replace toast-only notifications with a persistent notification inbox.
**Requirements**:
- Add a bell icon in the app header (next to hamburger menu on mobile, in sidebar on desktop)
- Show unread count badge (red dot with number)
- Clicking opens a dropdown/panel with notification list
- Each notification: Icon | Message | Timestamp | Read/Unread indicator
- For now, store notifications in Zustand state (frontend-only). Structure:
```typescript
interface AppNotification {
  id: string;
  type: 'rfq' | 'quote' | 'order' | 'payment' | 'system';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  actionUrl?: string; // e.g., '/app?tab=orders'
}
```
- Add to `Sidebar.tsx` or create `NotificationBell.tsx` component
- Mark as read when clicked
- "Mark all as read" button
**Acceptance criteria**: Users have a persistent notification inbox with unread count badge

---

## Boundaries

### DO:
- Create new component files as needed (follow existing naming: PascalCase for components)
- Add i18n keys to BOTH `en.json` and `ar.json`
- Follow existing TailwindCSS patterns exactly
- Use Material Symbols Outlined for icons
- Add TODO comments for any backend integration points that aren't ready yet
- Keep all components typed with TypeScript interfaces
- Make components responsive (mobile-first with `md:` breakpoints)

### DO NOT:
- Do NOT modify database schemas or write SQL migrations
- Do NOT modify `api.ts` service methods (just add stubs/interfaces for new endpoints)
- Do NOT change the routing structure in `App.tsx`
- Do NOT modify authentication logic
- Do NOT change existing RLS policies
- Do NOT install new npm packages without documenting the need

### Integration Points
When your components need data that doesn't exist yet, create a service stub:
```typescript
// In a new file or extending existing services:
// TODO: Implement when Antigravity delivers the database changes
export async function getQuoteItems(quoteId: string): Promise<QuoteItem[]> {
  // Stub: return empty array until backend is ready
  return [];
}
```

---

## Deliverables Checklist
- [ ] Gap #1: Updated QuoteComparison with per-item rows
- [ ] Gap #2: Partial quote badges + warning dialog
- [ ] Gap #3/#3a: Modified PO flow with two checkboxes + admin confirmation
- [ ] Gap #5: ClientInvoiceList component
- [ ] Gap #10: AUTO-QUOTE / CUSTOM badges
- [ ] Gap #13: Brand filter in client browse
- [ ] Gap #17: AdminSupplierPerformanceView
- [ ] Gap #18: Supplier win rate metric card
- [ ] Gap #20: AdminCreditUtilizationView
- [ ] Gap #21: BEST VALUE star indicator
- [ ] Gap #25: SLA time badge on approvals
- [ ] Gap #27: Ready for Pickup widget
- [ ] Gap #32: NotificationCenter component

## Quality Standards
1. All components must compile without TypeScript errors
2. All text must use i18n keys (no hardcoded English strings)
3. All components must be responsive
4. Maintain existing color scheme and design patterns
5. Add ARIA labels for accessibility where appropriate
6. No `any` types except in mapper functions that interface with raw database responses
