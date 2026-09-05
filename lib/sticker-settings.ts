import type { StickerTemplateRecord } from "@/lib/api/sticker-templates";
import { stickerSettingsApi, type StickerMappingSettings } from "@/lib/api/sticker-settings";

export type { StickerMappingSettings };

const STORAGE_KEY = "stp_sticker_template_mapping";

/**
 * Synchronously retrieves cached mapping from localStorage (instant fallback)
 */
export function getStickerMapping(): StickerMappingSettings {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            return JSON.parse(raw);
        }
    } catch {
        // ignore JSON parse error
    }
    return {};
}

/**
 * Saves mapping locally to localStorage cache
 */
export function saveStickerMappingLocal(mapping: StickerMappingSettings): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping));
    } catch (e) {
        console.error("Failed to save sticker template mapping locally", e);
    }
}

/**
 * Fetches sticker template mapping from Backend Database, syncs local cache, and returns it.
 * Falls back to localStorage cache if backend request fails.
 */
export async function fetchStickerMapping(): Promise<StickerMappingSettings> {
    try {
        const remote = await stickerSettingsApi.get();
        if (remote && (remote.laminateTemplateId !== undefined || remote.standardTemplateId !== undefined)) {
            saveStickerMappingLocal(remote);
            return remote;
        }
    } catch (err) {
        console.warn("fetchStickerMapping error, falling back to cache:", err);
    }
    return getStickerMapping();
}

/**
 * Saves sticker template mapping to Database and syncs local cache.
 */
export async function saveStickerMapping(mapping: StickerMappingSettings): Promise<StickerMappingSettings> {
    saveStickerMappingLocal(mapping);
    try {
        const updated = await stickerSettingsApi.update(mapping);
        if (updated) {
            saveStickerMappingLocal(updated);
            return updated;
        }
    } catch (err) {
        console.error("Failed to save sticker template mapping to backend:", err);
    }
    return mapping;
}

/**
 * Checks if a glass pane belongs to the Laminated or Insulated group (Template 1: 1. ลามิเนต/อินซูเลท)
 * Otherwise it belongs to the Tempered or Standard Float Cut group (Template 2: 2. เทมเปอร์/ตัดธรรมดา).
 * 
 * Specifically optimized to handle both newly saved requests and legacy/historical data
 * where productType may be empty or residual composite layers exist on single glass panes.
 */
export function isPaneLaminateOrInsulate(pane: any): boolean {
    if (!pane) return false;

    // 1. Explicit single glass indicators (Always Template 2: Tempered / Standard Cut)
    const productType = String(pane.productType || pane.productTypeLabel || "").toLowerCase().trim();
    if (
        productType === "single" ||
        productType === "standard" ||
        productType === "ธรรมดา" ||
        productType === "เดี่ยว" ||
        productType === "ธรรมดา (เดี่ยว)" ||
        productType === "กระจกเดี่ยว" ||
        productType === "tempered" ||
        productType === "tp"
    ) {
        return false;
    }

    // 2. Sub-sheet of a composite unit (laminateRole === "sheet" -> tempered/float component)
    if (pane.laminateRole === "sheet") {
        return false;
    }

    // 3. Parent composite unit (laminateRole === "parent" -> always Template 1: Laminate/Insulate)
    if (pane.laminateRole === "parent") {
        return true;
    }

    // 4. Explicit laminate / insulate indicators in productType
    if (
        productType === "laminated" ||
        productType === "insulated" ||
        productType === "laminate" ||
        productType === "insulate" ||
        /ลามิเนต|ลามิเนท|อินซูเลท/i.test(productType)
    ) {
        return true;
    }

    // 5. Check text in jobType, glassType, glassTypeLabel, name, etc.
    const jobText = [
        pane.jobType,
        pane.glassType,
        pane.glassTypeLabel,
        pane.rawGlass?.glassType,
        pane.rawGlassType,
        pane.sheetLabel,
        pane.name,
    ].filter(Boolean).join(" ");

    const hasLamOrInsKeywords = /ลามิเนต|ลามิเนท|อินซูเลท|laminat|insulat|dgu|igu/i.test(jobText);
    if (hasLamOrInsKeywords) {
        return true;
    }

    // 6. Check single / standard job types in legacy data
    // If jobType or glassType is clearly a single glass process and has no laminate keywords -> Template 2
    const isSingleProcess = /(?:^|\b|\s)(?:tp|tempered|clear|tinted|frosted|sandblast|พ่นทราย|ตัดธรรมดา|ธรรมดา|ใส|เขียว|ชา|ดำ|cnc|เจียร|float|raw)(?:\b|\s|$)/i.test(jobText);

    // 7. Check compositeLayers only if NOT an explicit single process
    if (Array.isArray(pane.compositeLayers) && pane.compositeLayers.length > 0) {
        const hasValidFilm = pane.compositeLayers.some(
            (l: any) => l && l.filmAirType && String(l.filmAirType).trim().length > 0 && l.filmAirType !== "—" && l.filmAirType !== "-"
        );
        if (hasValidFilm && !isSingleProcess) {
            return true;
        }
    }

    return false;
}

/**
 * Intelligently resolves Template 1 (Laminate) and Template 2 (Standard/Tempered)
 * from explicit mapping, template names, or positional order.
 */
export function resolveStickerTemplates(
    templates: StickerTemplateRecord[],
    mapping?: StickerMappingSettings
): {
    laminateTemplate: StickerTemplateRecord | null;
    standardTemplate: StickerTemplateRecord | null;
} {
    if (!templates || templates.length === 0) {
        return { laminateTemplate: null, standardTemplate: null };
    }

    const map = mapping || getStickerMapping();

    // 1. Resolve laminate template (Template 1)
    let laminate: StickerTemplateRecord | null = null;
    if (map.laminateTemplateId && map.laminateTemplateId !== "__none__") {
        laminate = templates.find((t) => t._id === map.laminateTemplateId) || null;
    }
    if (!laminate) {
        laminate = templates.find((t) =>
            /ลามิเนต|laminat|lam|แม่แบบ\s*1|เทมเพลต\s*1|template\s*1/i.test(t.name)
        ) || templates[0] || null;
    }

    // 2. Resolve standard / tempered template (Template 2)
    let standard: StickerTemplateRecord | null = null;
    if (map.standardTemplateId && map.standardTemplateId !== "__none__") {
        standard = templates.find((t) => t._id === map.standardTemplateId) || null;
    }
    if (!standard) {
        standard = templates.find((t) =>
            /เทมเปอร์|tempered|tp|ตัดธรรมดา|ธรรมดา|มาตรฐาน|แม่แบบ\s*2|เทมเพลต\s*2|template\s*2/i.test(t.name)
        ) || (templates.length > 1 ? templates[1] : templates[0]) || null;
    }

    return { laminateTemplate: laminate, standardTemplate: standard };
}
