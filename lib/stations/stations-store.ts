// User-created station storage (localStorage)

const KEY = "std_stations";

export interface StationEntity {
    _id:        string;
    name:       string;
    colorId:    string;   // key into COLOR_OPTIONS
    templateId?: string;
    createdAt:  string;
    updatedAt:  string;
}

// ── Predefined color palettes ─────────────────────────────────────────────────
export interface ColorOption {
    id:    string;
    label: string;
    /** Full Tailwind class string for the badge */
    cls:   string;
    /** Solid swatch color for the color picker dot */
    swatch: string;
}

export const COLOR_OPTIONS: ColorOption[] = [
    { id: "sky",    label: "ฟ้า",    cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",         swatch: "#0ea5e9" },
    { id: "blue",   label: "น้ำเงิน", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",     swatch: "#3b82f6" },
    { id: "violet", label: "ม่วง",   cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300", swatch: "#8b5cf6" },
    { id: "pink",   label: "ชมพู",   cls: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",     swatch: "#ec4899" },
    { id: "red",    label: "แดง",    cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",         swatch: "#ef4444" },
    { id: "orange", label: "ส้ม",    cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300", swatch: "#f97316" },
    { id: "yellow", label: "เหลือง", cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300", swatch: "#eab308" },
    { id: "green",  label: "เขียว",  cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", swatch: "#22c55e" },
    { id: "teal",   label: "เทียล",  cls: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",     swatch: "#14b8a6" },
    { id: "slate",  label: "เทา",    cls: "bg-slate-100 text-slate-600 dark:bg-slate-700/30 dark:text-slate-300", swatch: "#64748b" },
];

export function getColorOption(id: string): ColorOption {
    return COLOR_OPTIONS.find((c) => c.id === id) ?? COLOR_OPTIONS[0];
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────
function readAll(): StationEntity[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as StationEntity[]) : [];
    } catch { return []; }
}

function writeAll(stations: StationEntity[]): void {
    localStorage.setItem(KEY, JSON.stringify(stations));
}

function newId(): string {
    return `stn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function getStations(): StationEntity[] {
    return readAll();
}

export function createStation(data: { name: string; colorId: string; templateId?: string }): StationEntity {
    const now = new Date().toISOString();
    const station: StationEntity = { _id: newId(), ...data, createdAt: now, updatedAt: now };
    const list = readAll();
    list.unshift(station);
    writeAll(list);
    return station;
}

export function updateStation(id: string, patch: Partial<Pick<StationEntity, "name" | "colorId" | "templateId">>): void {
    const list = readAll();
    const idx  = list.findIndex((s) => s._id === id);
    if (idx === -1) return;
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    writeAll(list);
}

export function deleteStation(id: string): void {
    writeAll(readAll().filter((s) => s._id !== id));
}
