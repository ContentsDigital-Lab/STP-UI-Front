/**
 * Glass Physics Calculation and Formatting Utilities
 * StandardPlus Sticker System & Order Calculations (Requirements 1-15)
 */

export const THICKNESS_FACTORS: Record<string, number> = {
    "3": 7.43,
    "4": 9.58,
    "5": 11.55,
    "6": 14.03,
    "8": 18.66,
    "10": 22.66,
    "12": 29.90,
    "15": 36.87,
    "16": 37.32,
    "20": 45.32,
    "24": 59.80,
    "30": 73.74,
};

/**
 * Extracts pure numeric thickness value from strings like "6", "6mm", "8 mm", "12"
 */
export function normalizeThickness(thickness: string | number | undefined | null): string {
    if (!thickness) return "";
    const str = String(thickness).trim();
    const match = str.match(/\d+(\.\d+)?/);
    return match ? match[0] : str;
}

/**
 * Gets the weight factor for a given thickness (mm)
 */
export function getThicknessFactor(thickness: string | number | undefined | null): number {
    const norm = normalizeThickness(thickness);
    if (THICKNESS_FACTORS[norm] !== undefined) {
        return THICKNESS_FACTORS[norm];
    }
    const num = parseFloat(norm);
    if (!isNaN(num)) {
        // Fallback approximation: density ~2.5 g/cm3 -> ~2.4-2.5 kg/m2 per mm
        return num * 2.34;
    }
    return 0;
}

/**
 * Formula 1: Weight in KG (ข้อ 13 น้ำหนัก)
 * Weight = (Width * Height / 1,000,000) * ThicknessFactor * Quantity * (isLaminated ? 2 : 1)
 */
export function calcGlassWeight(
    widthMm: number,
    heightMm: number,
    thickness: string | number,
    quantity: number,
    isLaminated: boolean = false
): number {
    if (!widthMm || !heightMm || !quantity || quantity <= 0) return 0;
    const factor = getThicknessFactor(thickness);
    if (!factor) return 0;
    const areaSqM = (widthMm * heightMm) / 1_000_000;
    const weight = areaSqM * factor * quantity * (isLaminated ? 2 : 1);
    return Number(weight.toFixed(2));
}

/**
 * Formula 2: Perimeter in Meters (ข้อ 13 ความยาวรอบรูป เมตร)
 * Perimeter = (((Width * 2) + (Height * 2)) * Quantity) / 1,000
 */
export function calcGlassPerimeterMeters(
    widthMm: number,
    heightMm: number,
    quantity: number
): number {
    if (!widthMm || !heightMm || !quantity || quantity <= 0) return 0;
    const perimeter = (((widthMm * 2) + (heightMm * 2)) * quantity) / 1_000;
    return Number(perimeter.toFixed(2));
}

/**
 * Formula 3: Area in Square Feet (ข้อ 13 พื้นที่ ตารางฟุต)
 * Area = (Width * Height * 10.764 / 1,000,000) * Quantity
 */
export function calcGlassAreaSqFt(
    widthMm: number,
    heightMm: number,
    quantity: number
): number {
    if (!widthMm || !heightMm || !quantity || quantity <= 0) return 0;
    const sqFt = ((widthMm * heightMm * 10.764) / 1_000_000) * quantity;
    return Number(sqFt.toFixed(2));
}

/**
 * Grinding profile code to Thai name mapping
 */
export const GRINDING_LABELS: Record<string, string> = {
    "N": "ธรรมดา",
    "D": "เจียรริม",
    "B": "เจียรหยาบ",
    "BE": "เจียรปลี",
    "AA": "เจียรลูกหนู",
    "A": "ลบคม",
    "PLAIN": "ธรรมดา",
    "POLISHED": "เจียรริม",
    "ROUGH": "เจียรหยาบ",
    "BEVEL": "เจียรปลี",
    "SEAMED": "ลบคม",
};

export function getGrindingName(code: string | undefined | null): string {
    if (!code) return "ธรรมดา";
    const upper = code.toUpperCase().trim();
    return GRINDING_LABELS[upper] || code;
}

/**
 * Combines 4 grinding sides into summary string (ข้อ 5 การเจียรริม)
 * - If all 4 are identical: e.g. "เจียรริม ทั้งหมด", "ลบคม ทั้งหมด"
 * - If top & bottom same and left & right same: e.g. "เจียรริมบนและล่าง เจียรหยาบซ้ายและขวา"
 * - If different: e.g. "เจียรริมบน เจียรหยาบล่าง เจียรปลีซ้าย ลบคมขวา"
 */
export function formatGrindingSummary(
    top: string = "N",
    bottom: string = "N",
    left: string = "N",
    right: string = "N"
): string {
    const t = getGrindingName(top);
    const b = getGrindingName(bottom);
    const l = getGrindingName(left);
    const r = getGrindingName(right);

    // Case 1: All 4 sides identical
    if (t === b && b === l && l === r) {
        if (t === "ธรรมดา") return "ธรรมดา";
        return `${t} ทั้งหมด`;
    }

    // Case 2: Top & Bottom same, Left & Right same
    if (t === b && l === r) {
        const tbPart = t !== "ธรรมดา" ? `${t}บนและล่าง` : "";
        const lrPart = l !== "ธรรมดา" ? `${l}ซ้ายและขวา` : "";
        if (tbPart && lrPart) return `${tbPart} ${lrPart}`;
        return tbPart || lrPart || "ธรรมดา";
    }

    // Case 3: Pairwise or individual sides
    const parts: string[] = [];
    if (t === b && t !== "ธรรมดา") {
        parts.push(`${t}บนและล่าง`);
    } else {
        if (t !== "ธรรมดา") parts.push(`${t}บน`);
        if (b !== "ธรรมดา") parts.push(`${b}ล่าง`);
    }

    if (l === r && l !== "ธรรมดา") {
        parts.push(`${l}ซ้ายและขวา`);
    } else {
        if (l !== "ธรรมดา") parts.push(`${l}ซ้าย`);
        if (r !== "ธรรมดา") parts.push(`${r}ขวา`);
    }

    return parts.length > 0 ? parts.join(" ") : "ธรรมดา";
}

/**
 * Formats dimensions with spacing e.g. "900 X 1301" (ข้อ 9 ขนาด 100X100)
 * Supports:
 * 1. Standard 2-dimensions: "900 X 1301"
 * 2. 3-dimensions (Max 1 extra multiplier): "810 x 1000 x 831 mm"
 * 3. Pattern cut: "**ตัดตามแบบ**"
 * 4. Custom text override
 */
export function formatDimensionsDisplay(
    widthMm?: number,
    heightMm?: number,
    customText?: string,
    depth3Mm?: number,
    isCutByPattern?: boolean
): string {
    if (isCutByPattern || customText === "**ตัดตามแบบ**") {
        return "**ตัดตามแบบ**";
    }
    if (customText && customText.trim()) {
        return customText.trim();
    }
    const w = widthMm || 0;
    const h = heightMm || 0;
    if (depth3Mm && depth3Mm > 0) {
        return `${Math.round(w)} x ${Math.round(h)} x ${Math.round(depth3Mm)} mm`;
    }
    if (!w && !h) return "";
    return `${Math.round(w)} X ${Math.round(h)} mm`;
}

export interface CompositeLayerSpec {
    filmAirType: string;
    rawGlassColor: string;
    thickness: string;
}

/**
 * Builds composite glass layer formula string (ข้อ 14 & 15)
 * 2 layers: TP ใส 6 + PVB0.38ใส + ใส 5
 * 3 layers: TP ใส 6 + AIR 6 + TP ใส 6 + AIR 6 + TP ใส 6
 */
export function formatCompositeFormula(
    jobType: string = "",
    rawColor: string = "",
    thickness: string = "",
    productType: string = "",
    layers: CompositeLayerSpec[] = []
): string {
    const isTP = jobType?.toUpperCase().includes("TP") || jobType?.toLowerCase().includes("tempered");
    const firstLayerPrefix = isTP ? "TP" : "";
    const color1 = rawColor ? rawColor.trim() : "";
    const thk1 = normalizeThickness(thickness);
    const layer1 = [firstLayerPrefix, color1, thk1].filter(Boolean).join(" ").trim();

    if (!productType || !layers || layers.length === 0) {
        return layer1;
    }

    const parts = [layer1];
    for (const lyr of layers) {
        const film = lyr.filmAirType ? lyr.filmAirType.trim() : "";
        const color = lyr.rawGlassColor ? lyr.rawGlassColor.trim() : "";
        const thk = normalizeThickness(lyr.thickness);
        if (film) parts.push(film);
        const layerNext = [color, thk].filter(Boolean).join(" ").trim();
        if (layerNext) parts.push(layerNext);
    }

    return parts.join(" + ");
}

/**
 * Summary for Holes and Notches (ข้อ 10)
 * e.g. "จำนวน 2 รู จำนวนบาก 1 บาก" or empty if none
 */
export function formatHolesAndNotches(holes: number = 0, notches: number = 0): string {
    const parts: string[] = [];
    if (holes > 0) parts.push(`จำนวน ${holes} รู`);
    if (notches > 0) parts.push(`จำนวนบาก ${notches} บาก`);
    return parts.join(" ");
}
