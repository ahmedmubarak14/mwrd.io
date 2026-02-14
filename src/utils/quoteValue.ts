export interface BestValueQuoteInput {
  id: string;
  price: number;
  leadTime?: string | number | null;
  rating?: number | null;
}

export const BEST_VALUE_WEIGHTS = {
  price: 0.6,
  leadTime: 0.25,
  rating: 0.15,
} as const;

export const parseLeadTimeDays = (leadTime?: string | number | null): number => {
  if (typeof leadTime === 'number' && Number.isFinite(leadTime)) {
    return leadTime;
  }
  if (!leadTime) return Number.MAX_SAFE_INTEGER;
  const parsed = Number.parseInt(String(leadTime), 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
};

const normalize = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value) || max === min) return 0;
  return (value - min) / (max - min);
};

export const getBestValueQuoteId = (quotes: BestValueQuoteInput[]): string | null => {
  if (quotes.length < 2) return null;

  const values = quotes.map((quote) => ({
    id: quote.id,
    price: Number.isFinite(Number(quote.price)) ? Number(quote.price) : 0,
    leadDays: parseLeadTimeDays(quote.leadTime),
    rating: Number.isFinite(Number(quote.rating)) ? Number(quote.rating) : 0,
  }));

  const prices = values.map((entry) => entry.price);
  const leadTimes = values.map((entry) => entry.leadDays);
  const ratings = values.map((entry) => entry.rating);

  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const minLead = Math.min(...leadTimes);
  const maxLead = Math.max(...leadTimes);
  const minRating = Math.min(...ratings);
  const maxRating = Math.max(...ratings);

  const scored = values.map((entry) => {
    const normalizedPrice = normalize(entry.price, minPrice, maxPrice);
    const normalizedLead = normalize(entry.leadDays, minLead, maxLead);
    const normalizedRating = normalize(entry.rating, minRating, maxRating);

    const score = (BEST_VALUE_WEIGHTS.price * normalizedPrice)
      + (BEST_VALUE_WEIGHTS.leadTime * normalizedLead)
      + (BEST_VALUE_WEIGHTS.rating * (1 - normalizedRating));

    return { ...entry, score };
  });

  scored.sort((a, b) => {
    if (a.score === b.score) return a.price - b.price;
    return a.score - b.score;
  });

  return scored[0]?.id || null;
};
