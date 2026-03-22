/**
 * parseQrScan — parses a raw QR/barcode scan value into a lookup key.
 *
 * Supported formats:
 *   - Full URL:   https://...domain.../production/{orderId}
 *   - ObjectId:   507f1f77bcf86cd799439011
 *   - Short code: ORD-001, C001
 *   - Pane QR:    STDPLUS:PNE-0001  →  { type: "pane", value: "PNE-0001" }
 *
 * Returns:
 *   { type: "id",   value: "507f1f77bcf86cd799439011" }
 *   { type: "code", value: "ORD-001" }
 *   { type: "pane", value: "PNE-0001" }
 */

export interface ParsedQr {
    type: "id" | "code" | "pane";
    value: string;
}

/** 24-hex MongoDB ObjectId pattern */
const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

/**
 * Try to extract an ObjectId from a URL path like:
 *   /production/507f1f77bcf86cd799439011
 *   /orders/507f1f77bcf86cd799439011
 * Returns the id string or null.
 */
function extractIdFromUrl(raw: string): string | null {
    try {
        const url = new URL(raw);
        // Look for a 24-hex segment anywhere in the pathname
        const parts = url.pathname.split("/").filter(Boolean);
        for (const part of parts) {
            if (OBJECT_ID_RE.test(part)) return part;
        }
    } catch {
        // Not a valid URL — handled below
    }
    return null;
}

/** STDPLUS:PNE-XXXX pane QR prefix */
const STDPLUS_PREFIX = /^STDPLUS:/i;

export function parseQrScan(raw: string): ParsedQr {
    const trimmed = raw.trim();

    // 1. STDPLUS: prefixed pane QR code (e.g. "STDPLUS:PNE-0001")
    if (STDPLUS_PREFIX.test(trimmed)) {
        const paneNumber = trimmed.replace(STDPLUS_PREFIX, "").trim();
        return { type: "pane", value: paneNumber };
    }

    // 2. Full URL — extract ObjectId from path
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        const id = extractIdFromUrl(trimmed);
        if (id) return { type: "id", value: id };
        return { type: "code", value: trimmed };
    }

    // 3. Plain ObjectId (24 hex chars)
    if (OBJECT_ID_RE.test(trimmed)) {
        return { type: "id", value: trimmed };
    }

    // 4. PNE- prefix without STDPLUS: wrapper
    if (/^PNE-/i.test(trimmed)) {
        return { type: "pane", value: trimmed.toUpperCase() };
    }

    // 5. Short code or custom identifier (e.g. "ORD-001", "C001")
    return { type: "code", value: trimmed.toUpperCase() };
}
