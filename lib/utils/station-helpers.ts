import type { PaneStation } from "@/lib/api/types";

type StationRef = PaneStation | { _id?: string; name?: string } | undefined;

/** Extract the station ObjectId from a populated object or plain string */
export function getStationId(station: StationRef): string {
    if (!station) return "";
    if (typeof station === "string") return station;
    return station._id ?? "";
}

/** Extract the display name from a populated object or plain string */
export function getStationName(station: StationRef): string {
    if (!station) return "";
    if (typeof station === "string") return station;
    return station.name ?? station._id ?? "";
}

/** Check if a station ref matches a given stationId or stationName */
export function isStationMatch(station: StationRef, id?: string | null, name?: string | null): boolean {
    if (!station) return false;
    const sid = getStationId(station);
    const sname = getStationName(station);
    return (!!id && (sid === id || sname === id)) || (!!name && (sname === name || sid === name));
}

type WithdrawalRef = string | { _id?: string } | null | undefined;

/** Pane must be linked to a material withdrawal before start / complete at station. */
export function isPaneWithdrawn(pane: { withdrawal?: WithdrawalRef } | null | undefined): boolean {
    if (!pane) return false;
    const w = pane.withdrawal;
    if (w == null) return false;
    if (typeof w === "string") return w.trim().length > 0;
    return typeof w === "object" && w !== null;
}

/**
 * Heuristic for stations (e.g. ตัด) where mobile “complete” scan should require withdrawal.
 * Designer layouts use per-block `requireWithdrawalBeforeWork` instead.
 */
export function stationNameRequiresWithdrawalBeforeComplete(name: string | null | undefined): boolean {
    if (!name?.trim()) return false;
    const lower = name.trim().toLowerCase();
    if (lower.includes("ตัด")) return true;
    return /\bcut(ting)?\b/i.test(name);
}

export function formatPaneDimWithUnit(pane: any, contextRecord?: any): { dimStr: string | null; thicknessStr: string | null } {
    if (!pane.dimensions || (pane.dimensions.width <= 0 && pane.dimensions.height <= 0)) {
        return { dimStr: null, thicknessStr: null };
    }
    
    const o = (typeof pane.order === "object" ? pane.order : null) as any;
    const r = (typeof pane.request === "object" ? pane.request : (o?.request && typeof o.request === "object" ? o.request : null)) as any;
    
    let isInch = false;
    
    // 1. Check pane.jobType directly
    if (typeof pane.jobType === "string" && pane.jobType.toLowerCase().includes("inch")) {
        isInch = true;
    }
    // 2. Check pane.material.name directly
    else if (pane.material && typeof pane.material === "object" && typeof pane.material.name === "string") {
        const matName = pane.material.name.toLowerCase();
        if (matName.includes("inch") || matName.includes("นิ้ว")) {
            isInch = true;
        }
    }
    
    if (!isInch && contextRecord) {
        // If contextRecord is a Request
        if (contextRecord.details && typeof contextRecord.details.type === "string") {
            isInch = contextRecord.details.type.toLowerCase().includes("inch");
        }
        // If contextRecord is an Order with populated Request
        else if (contextRecord.request && typeof contextRecord.request === "object" && contextRecord.request.details?.type) {
            isInch = contextRecord.request.details.type.toLowerCase().includes("inch");
        }
        // If contextRecord is an Order with just material populated
        else if (contextRecord.material && typeof contextRecord.material === "object" && typeof contextRecord.material.name === "string") {
            const matName = contextRecord.material.name.toLowerCase();
            isInch = matName.includes("inch") || matName.includes("นิ้ว");
        }
    }
    
    if (!isInch) {
        isInch = r?.details?.type?.toLowerCase().includes("inch") ?? false;
    }
    
    // 3. Fallback: Check if glassTypeLabel contains the dimensions in inches
    if (!isInch && pane.glassTypeLabel) {
        const match = pane.glassTypeLabel.match(/(\d+)\s*[\*xX]\s*(\d+)/);
        if (match) {
            const w1 = parseInt(match[1], 10);
            const h1 = parseInt(match[2], 10);
            const wIn = Math.round(pane.dimensions.width / 25.4);
            const hIn = Math.round(pane.dimensions.height / 25.4);
            if ((w1 === wIn && h1 === hIn) || (w1 === hIn && h1 === wIn)) {
                isInch = true;
            }
        }
    }
    
    // 4. Fallback: If dimensions are exact decimals that perfectly translate to integers in inches
    if (!isInch) {
        const wIn = pane.dimensions.width / 25.4;
        const hIn = pane.dimensions.height / 25.4;
        if (Math.abs(wIn - Math.round(wIn)) < 0.01 && Math.abs(hIn - Math.round(hIn)) < 0.01) {
            if (pane.dimensions.width % 1 !== 0 || pane.dimensions.height % 1 !== 0) {
                isInch = true;
            }
        }
    }
    
    const w = isInch ? Number((pane.dimensions.width / 25.4).toFixed(2)) : pane.dimensions.width;
    const h = isInch ? Number((pane.dimensions.height / 25.4).toFixed(2)) : pane.dimensions.height;
    
    const dimStr = `${w} * ${h} ${isInch ? "inch" : "mm"}`;
    const thicknessStr = pane.dimensions.thickness > 0 ? `(${pane.dimensions.thickness}mm)` : null;
    return { dimStr, thicknessStr };
}
