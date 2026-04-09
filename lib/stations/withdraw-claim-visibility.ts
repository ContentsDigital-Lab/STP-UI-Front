import type { Station } from "@/lib/api/types";

const LS_KEY = "std_station_show_withdraw_claim_v1";

function readMap(): Record<string, boolean> {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
        const out: Record<string, boolean> = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (v === false) out[k] = false;
        }
        return out;
    } catch {
        return {};
    }
}

function writeMap(map: Record<string, boolean>) {
    if (typeof window === "undefined") return;
    localStorage.setItem(LS_KEY, JSON.stringify(map));
}

/** API wins when it returns a boolean; otherwise use local preference (for backends that omit the field). */
export function effectiveShowWithdrawClaimActions(
    station: Pick<Station, "_id" | "showWithdrawClaimActions">
): boolean {
    if (station.showWithdrawClaimActions === false) return false;
    if (station.showWithdrawClaimActions === true) return true;
    if (typeof window === "undefined") return true;
    return readMap()[station._id] !== false;
}

/** Call after successful create/update so the toggle persists even if the API ignores the field. */
export function syncWithdrawClaimLocalPreference(
    stationId: string,
    show: boolean | undefined
): void {
    if (typeof window === "undefined" || !stationId) return;
    const map = readMap();
    if (show === false) map[stationId] = false;
    else delete map[stationId];
    writeMap(map);
    window.dispatchEvent(
        new CustomEvent("std-withdraw-claim-pref", { detail: { stationId } })
    );
}

export function removeWithdrawClaimLocalPreference(stationId: string): void {
    if (typeof window === "undefined" || !stationId) return;
    const map = readMap();
    delete map[stationId];
    writeMap(map);
}
