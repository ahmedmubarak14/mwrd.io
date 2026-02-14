import { RFQ, Quote, Product, QuoteItem, SystemConfig, User, UserRole } from '../types/types';
import { logger } from '../utils/logger';

const generateAutoQuoteId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `aq-${crypto.randomUUID()}`;
    }

    return `aq-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
};

/** Margin setting entry from the store */
export type MarginSetting = { category: string | null; marginPercent: number; isDefault: boolean };

/**
 * Determine the effective margin for a product category using the hierarchy:
 *   Manual Override > Client-Specific > MAX(Category, Global)
 * Auto-quotes don't have manual/client overrides, so we always use MAX(Category, Global).
 */
const getEffectiveAutoQuoteMargin = (
    productCategory: string,
    globalMargin: number,
    marginSettings: MarginSetting[]
): number => {
    const catSetting = marginSettings.find(m => m.category === productCategory);
    const categoryMargin = catSetting?.marginPercent ?? 0;
    // PRD rule: use the HIGHER of category margin vs global margin
    return Math.max(categoryMargin, globalMargin);
};

export const autoQuoteService = {
    /**
     * Check for RFQs that need auto-quoting.
     * Now accepts marginSettings to apply MAX(category, global) margin logic per PRD.
     * Also respects autoQuoteEnabled flag — returns empty if disabled.
     */
    checkAutoQuotes: (
        rfqs: RFQ[],
        products: Product[],
        users: User[],
        quotes: Quote[],
        config: SystemConfig,
        marginSettings: MarginSetting[] = []
    ): { updatedRfqs: RFQ[], newQuotes: Quote[] } => {

        // If auto-quote is explicitly disabled, skip entirely
        if (config.autoQuoteEnabled === false) {
            logger.debug('Auto-quote system is disabled, skipping check');
            return { updatedRfqs: [], newQuotes: [] };
        }

        logger.debug('Checking for auto-quotes', { config });
        const now = new Date();
        const newQuotes: Quote[] = [];
        const updatedRfqs: RFQ[] = [];

        // Filter for OPEN rfqs that haven't been auto-quoted/triggered
        const openRfqs = rfqs.filter(r =>
            r.status === 'OPEN' && !r.autoQuoteTriggered
        );

        for (const rfq of openRfqs) {
            const created = new Date(rfq.createdAt);
            const diffMinutes = (now.getTime() - created.getTime()) / (1000 * 60);

            // Rule: If time elapsed > configured delay
            if (diffMinutes >= config.autoQuoteDelayMinutes) {
                logger.debug('RFQ exceeded auto-quote timer. Generating quotes.', {
                    rfqId: rfq.id,
                    elapsedMinutes: Number(diffMinutes.toFixed(1))
                });

                // 1. Mark RFQ as triggered
                const updatedRfq = { ...rfq, autoQuoteTriggered: true };
                updatedRfqs.push(updatedRfq);

                // 2. Group RFQ items by supplier and collect per-item margin data.
                const supplierMatches = new Map<string, Array<{
                    productId: string;
                    productName: string;
                    brand?: string;
                    category: string;
                    quantity: number;
                    supplierUnitPrice: number;
                    supplierLineTotal: number;
                    finalUnitPrice: number;
                    finalLineTotal: number;
                    marginPercent: number;
                }>>();

                for (const item of rfq.items) {
                    const product = products.find(p => p.id === item.productId);
                    if (!product) continue;

                    // Respect availability and limited-stock policy from admin settings.
                    const availability = String((product as any).availability || '').toUpperCase();
                    const isOutOfStockByAvailability = availability === 'OUT_OF_STOCK';
                    const isLimitedByAvailability = availability === 'LIMITED_STOCK' || availability === 'LIMITED';
                    const stockValue = Number((product as any).stock);
                    const hasNumericStock = Number.isFinite(stockValue);
                    const isOutOfStockByQuantity = hasNumericStock && stockValue <= 0;
                    const isLimitedByQuantity = hasNumericStock && stockValue > 0 && stockValue < item.quantity;
                    const shouldIncludeLimitedStock = config.autoQuoteIncludeLimitedStock === true;

                    if (isOutOfStockByAvailability || isOutOfStockByQuantity) continue;
                    if ((isLimitedByAvailability || isLimitedByQuantity) && !shouldIncludeLimitedStock) continue;

                    const supplierUnitPrice = Number(product.supplierPrice || 0);
                    const supplierLineTotal = supplierUnitPrice * item.quantity;
                    const marginPercent = getEffectiveAutoQuoteMargin(
                        product.category,
                        config.defaultMarginPercent,
                        marginSettings
                    );
                    const finalUnitPrice = supplierUnitPrice * (1 + marginPercent / 100);
                    const finalLineTotal = finalUnitPrice * item.quantity;

                    if (!supplierMatches.has(product.supplierId)) {
                        supplierMatches.set(product.supplierId, []);
                    }

                    supplierMatches.get(product.supplierId)?.push({
                        productId: product.id,
                        productName: product.name,
                        brand: product.brand || undefined,
                        category: product.category,
                        quantity: item.quantity,
                        supplierUnitPrice,
                        supplierLineTotal,
                        finalUnitPrice,
                        finalLineTotal,
                        marginPercent,
                    });
                }

                // Generate a quote for each supplier found
                supplierMatches.forEach((items, supplierId) => {
                    if (items.length === 0) return;

                    const totalSupplierPrice = items.reduce((sum, i) => sum + i.supplierLineTotal, 0);
                    const totalClientPrice = items.reduce((sum, i) => sum + i.finalLineTotal, 0);

                    // Determine effective margin using MAX(category, global) per-item,
                    // then use the weighted average across all items for the quote-level margin
                    let weightedMarginSum = 0;
                    let totalItemValue = 0;

                    for (const item of items) {
                        weightedMarginSum += item.marginPercent * item.supplierLineTotal;
                        totalItemValue += item.supplierLineTotal;
                    }

                    const effectiveMarginPercent = totalItemValue > 0
                        ? Math.round((weightedMarginSum / totalItemValue) * 100) / 100
                        : config.defaultMarginPercent;

                    const quoteItems: QuoteItem[] = items.map((item, index) => ({
                        id: `${rfq.id}-${supplierId}-${index}`,
                        productId: item.productId,
                        productName: item.productName,
                        brand: item.brand,
                        unitPrice: item.finalUnitPrice,
                        quantity: item.quantity,
                        lineTotal: item.finalLineTotal,
                        isAlternative: false,
                    }));

                    const configuredLeadTimeDays = Number((config as any).autoQuoteLeadTimeDays);
                    const autoLeadTimeDays = Number.isFinite(configuredLeadTimeDays) && configuredLeadTimeDays > 0
                        ? Math.round(configuredLeadTimeDays)
                        : 3;

                    const quote: Quote = {
                        id: generateAutoQuoteId(),
                        rfqId: rfq.id,
                        supplierId: supplierId,
                        supplierPrice: totalSupplierPrice,
                        leadTime: `${autoLeadTimeDays} Days (Auto)`,
                        marginPercent: effectiveMarginPercent,
                        finalPrice: totalClientPrice,
                        status: 'SENT_TO_CLIENT', // Auto-quotes go straight to client
                        type: 'auto',
                        quoteItems,
                    };

                    newQuotes.push(quote);
                    logger.debug('Generated auto-quote', {
                        quoteId: quote.id,
                        supplierId,
                        effectiveMarginPercent
                    });
                });
            }
        }

        return { updatedRfqs, newQuotes };
    }
};
