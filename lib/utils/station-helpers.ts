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
