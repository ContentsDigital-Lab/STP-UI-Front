import type { Station } from "@/lib/api/types";

const LS_KEY_WITHDRAW = "std_station_show_withdraw_v1";
const LS_KEY_CLAIM = "std_station_show_claim_v1";

function readMap(key: string): Record<string, boolean> {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(key);
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

function writeMap(key: string, map: Record<string, boolean>) {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, JSON.stringify(map));
}

export function effectiveShowWithdrawAction(
    station: Pick<Station, "_id" | "showWithdrawAction">
): boolean {
    if (station.showWithdrawAction === false) return false;
    if (station.showWithdrawAction === true) return true;
    if (typeof window === "undefined") return true;
    return readMap(LS_KEY_WITHDRAW)[station._id] !== false;
}

export function effectiveShowClaimAction(
    station: Pick<Station, "_id" | "showClaimAction">
): boolean {
    if (station.showClaimAction === false) return false;
    if (station.showClaimAction === true) return true;
    if (typeof window === "undefined") return true;
    return readMap(LS_KEY_CLAIM)[station._id] !== false;
}

export function syncWithdrawActionLocalPreference(
    stationId: string,
    show: boolean | undefined
): void {
    if (typeof window === "undefined" || !stationId) return;
    const map = readMap(LS_KEY_WITHDRAW);
    if (show === false) map[stationId] = false;
    else delete map[stationId];
    writeMap(LS_KEY_WITHDRAW, map);
    window.dispatchEvent(
        new CustomEvent("std-withdraw-claim-pref", { detail: { stationId } })
    );
}

export function syncClaimActionLocalPreference(
    stationId: string,
    show: boolean | undefined
): void {
    if (typeof window === "undefined" || !stationId) return;
    const map = readMap(LS_KEY_CLAIM);
    if (show === false) map[stationId] = false;
    else delete map[stationId];
    writeMap(LS_KEY_CLAIM, map);
    window.dispatchEvent(
        new CustomEvent("std-withdraw-claim-pref", { detail: { stationId } })
    );
}

export function removeWithdrawClaimLocalPreference(stationId: string): void {
    if (typeof window === "undefined" || !stationId) return;
    
    const withdrawMap = readMap(LS_KEY_WITHDRAW);
    delete withdrawMap[stationId];
    writeMap(LS_KEY_WITHDRAW, withdrawMap);
    
    const claimMap = readMap(LS_KEY_CLAIM);
    delete claimMap[stationId];
    writeMap(LS_KEY_CLAIM, claimMap);
}
