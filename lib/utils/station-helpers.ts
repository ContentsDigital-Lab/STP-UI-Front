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
