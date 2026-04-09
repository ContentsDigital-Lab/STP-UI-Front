import type { Material } from "@/lib/api/types";

/** Conservative enum: many backends only allow piece | sheet */
export const MATERIAL_UNIT_OPTIONS = [
    { value: "sheet", label: "แผ่น" },
    { value: "piece", label: "ชิ้น" },
] as const;

/** UI label for API unit (`sheet` → แผ่น); passthrough for unknown/custom units. */
export function materialUnitDisplayLabel(unit: string | undefined | null): string {
    if (unit == null || !String(unit).trim()) return "—";
    const raw = String(unit).trim();
    const lower = raw.toLowerCase();
    const opt = MATERIAL_UNIT_OPTIONS.find((o) => o.value === lower);
    if (opt) return opt.label;
    return raw;
}

const ALLOWED: Set<string> = new Set(MATERIAL_UNIT_OPTIONS.map((o) => o.value));

const ALIAS_TO_UNIT: Record<string, string> = {
    แผ่น: "sheet",
    ชิ้น: "piece",
    sheet: "sheet",
    piece: "piece",
    pcs: "piece",
    pc: "piece",
    เมตร: "sheet",
    ม้วน: "sheet",
    กล่อง: "piece",
    meter: "sheet",
    roll: "sheet",
    box: "piece",
};

/** Map Thai labels / synonyms to API unit enum; unknown → sheet (glass default). */
export function normalizeMaterialUnit(unit: string): string {
    const t = unit.trim();
    if (!t) return "sheet";
    const direct = ALIAS_TO_UNIT[t] ?? ALIAS_TO_UNIT[t.toLowerCase()];
    if (direct) return direct;
    if (ALLOWED.has(t.toLowerCase())) return t.toLowerCase();
    return "sheet";
}

function parsePositiveMm(raw: string): number | undefined {
    const s = raw.replace(/mm/gi, "").trim();
    if (!s) return undefined;
    const n = parseFloat(s);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    return Math.round(n * 1000) / 1000;
}

/** Zod expects string (or omit); avoid "3.000" when user typed "3". */
function specDimensionString(n: number): string {
    if (Number.isInteger(n)) return String(Math.round(n));
    const t = Math.round(n * 1000) / 1000;
    return String(t);
}

/** Build specDetails for POST/PATCH: thickness, width, length as strings per API Zod. */
export function buildMaterialSpecDetails(form: {
    thickness: string;
    color: string;
    glassType: string;
    width: string;
    length: string;
}): Material["specDetails"] {
    const specDetails: Material["specDetails"] = {};
    const t = parsePositiveMm(form.thickness);
    if (t != null) specDetails.thickness = specDimensionString(t);
    if (form.color.trim()) specDetails.color = form.color.trim();
    if (form.glassType.trim()) specDetails.glassType = form.glassType.trim();
    const w = parsePositiveMm(form.width);
    if (w != null) specDetails.width = specDimensionString(w);
    const len = parsePositiveMm(form.length);
    if (len != null) specDetails.length = specDimensionString(len);
    return specDetails;
}

export function materialPayloadFromForm(form: {
    name: string;
    unit: string;
    reorderPoint: number;
    thickness: string;
    color: string;
    glassType: string;
    width: string;
    length: string;
}): Partial<Material> {
    const reorderPoint = Math.max(0, Math.trunc(Number(form.reorderPoint) || 0));
    const specDetails = buildMaterialSpecDetails(form);
    return {
        name: form.name.trim(),
        unit: normalizeMaterialUnit(form.unit),
        reorderPoint,
        specDetails,
    };
}
