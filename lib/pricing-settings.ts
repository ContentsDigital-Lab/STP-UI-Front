// ── Glass Pricing Settings ───────────────────────────────────────────────────
// Primary storage: server (GET/PUT /api/pricing-settings).
// localStorage is used as an instant cache so the bill-creation page renders
// immediately without waiting for the network on every mount.

export const PRICING_STORAGE_KEY = "glass_pricing_settings_v1";

export interface GlassVariantPrice {
    pricePerSqFt: number;   // บาท/ตร.ฟ. (ราคาเนื้อกระจก)
    grindingRate: number;   // บาท/เมตร (ค่าเจียรขอบ)
}

// glassType → thickness → prices
export type GlassPriceTable = Record<string, Record<string, GlassVariantPrice>>;

export interface PricingSettings {
    glassPrices: GlassPriceTable;
    holePriceEach: number;  // บาท/รู  (ค่าเจาะรูสำหรับฮาร์ดแวร์)
    notchPrice: number;     // บาท/บาก (ค่าบากกระจก)
}

// ── Default values (อิงข้อมูลตาราง Excel ของร้าน) ────────────────────────────
export const DEFAULT_PRICING: PricingSettings = {
    holePriceEach: 50,
    notchPrice: 100,
    glassPrices: {
        Clear: {
            "3mm":  { pricePerSqFt: 35,  grindingRate: 50 },
            "5mm":  { pricePerSqFt: 50,  grindingRate: 50 },
            "6mm":  { pricePerSqFt: 55,  grindingRate: 50 },
            "8mm":  { pricePerSqFt: 65,  grindingRate: 50 },
            "10mm": { pricePerSqFt: 75,  grindingRate: 50 },
            "12mm": { pricePerSqFt: 85,  grindingRate: 75 },
            "15mm": { pricePerSqFt: 110, grindingRate: 75 },
            "19mm": { pricePerSqFt: 140, grindingRate: 75 },
        },
        Tinted: {
            "5mm":  { pricePerSqFt: 55,  grindingRate: 50 },
            "6mm":  { pricePerSqFt: 60,  grindingRate: 50 },
            "8mm":  { pricePerSqFt: 66,  grindingRate: 50 },
            "10mm": { pricePerSqFt: 76,  grindingRate: 75 },
            "12mm": { pricePerSqFt: 86,  grindingRate: 75 },
            "15mm": { pricePerSqFt: 110, grindingRate: 75 },
        },
        Tempered: {
            "5mm":  { pricePerSqFt: 85,  grindingRate: 75 },
            "6mm":  { pricePerSqFt: 95,  grindingRate: 75 },
            "8mm":  { pricePerSqFt: 104, grindingRate: 75 },
            "10mm": { pricePerSqFt: 114, grindingRate: 75 },
            "12mm": { pricePerSqFt: 125, grindingRate: 75 },
            "15mm": { pricePerSqFt: 150, grindingRate: 75 },
            "19mm": { pricePerSqFt: 180, grindingRate: 75 },
        },
        Laminated: {
            "6mm":  { pricePerSqFt: 90,  grindingRate: 75 },
            "8mm":  { pricePerSqFt: 100, grindingRate: 75 },
            "10mm": { pricePerSqFt: 112, grindingRate: 75 },
            "12mm": { pricePerSqFt: 125, grindingRate: 75 },
            "15mm": { pricePerSqFt: 150, grindingRate: 75 },
        },
        "Low-E": {
            "6mm":  { pricePerSqFt: 110, grindingRate: 75 },
            "8mm":  { pricePerSqFt: 120, grindingRate: 75 },
            "10mm": { pricePerSqFt: 135, grindingRate: 75 },
            "12mm": { pricePerSqFt: 152, grindingRate: 75 },
        },
        Frosted: {
            "5mm":  { pricePerSqFt: 60,  grindingRate: 50 },
            "6mm":  { pricePerSqFt: 68,  grindingRate: 50 },
            "8mm":  { pricePerSqFt: 76,  grindingRate: 75 },
            "10mm": { pricePerSqFt: 86,  grindingRate: 75 },
        },
        Reflective: {
            "6mm":  { pricePerSqFt: 85,  grindingRate: 75 },
            "8mm":  { pricePerSqFt: 95,  grindingRate: 75 },
            "10mm": { pricePerSqFt: 108, grindingRate: 75 },
        },
        Patterned: {
            "5mm":  { pricePerSqFt: 55,  grindingRate: 50 },
            "6mm":  { pricePerSqFt: 65,  grindingRate: 50 },
        },
    },
};

export const ALL_THICKNESSES = ["3mm", "5mm", "6mm", "8mm", "10mm", "12mm", "15mm", "19mm"];

// ── localStorage cache helpers (for instant first render) ─────────────────────
export function getCachedPricingSettings(): PricingSettings {
    if (typeof window === "undefined") return DEFAULT_PRICING;
    try {
        const raw = localStorage.getItem(PRICING_STORAGE_KEY);
        if (!raw) return DEFAULT_PRICING;
        const parsed = JSON.parse(raw) as PricingSettings;
        return {
            holePriceEach: parsed.holePriceEach ?? DEFAULT_PRICING.holePriceEach,
            notchPrice:    parsed.notchPrice    ?? DEFAULT_PRICING.notchPrice,
            glassPrices:   parsed.glassPrices   ?? DEFAULT_PRICING.glassPrices,
        };
    } catch {
        return DEFAULT_PRICING;
    }
}

export function cachePricingSettings(settings: PricingSettings): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(PRICING_STORAGE_KEY, JSON.stringify(settings));
}

// ── Legacy helpers (kept for backwards-compat, now backed by cache) ───────────
/** @deprecated Use getCachedPricingSettings + API fetch instead */
export function loadPricingSettings(): PricingSettings {
    return getCachedPricingSettings();
}

/** @deprecated Use pricingSettingsApi.update instead */
export function savePricingSettings(settings: PricingSettings): void {
    cachePricingSettings(settings);
}
