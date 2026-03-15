// Station → Template assignment storage (localStorage)

const KEY = "std_station_assignments";

/** Map of stationId → templateId */
export type AssignmentMap = Record<string, string>;

export function readAssignments(): AssignmentMap {
    if (typeof window === "undefined") return {};
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as AssignmentMap) : {};
    } catch {
        return {};
    }
}

export function writeAssignment(stationId: string, templateId: string): void {
    const map = readAssignments();
    map[stationId] = templateId;
    localStorage.setItem(KEY, JSON.stringify(map));
}

export function clearAssignment(stationId: string): void {
    const map = readAssignments();
    delete map[stationId];
    localStorage.setItem(KEY, JSON.stringify(map));
}
