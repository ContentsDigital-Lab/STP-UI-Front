// ── User-created station store ────────────────────────────────────────────────
// Stations are created by users with custom names, colors, and template assignments.
// Persisted in localStorage under key "std_stations".

export interface StationEntity {
    _id:         string;
    name:        string;
    colorId:     string;
    templateId?: string;
    createdAt:   string;
    updatedAt:   string;
}

export interface ColorOption {
    id:     string;
    label:  string;
    cls:    string;   // full Tailwind bg+text class string
    swatch: string;   // hex for the color picker dot
}

export const COLOR_OPTIONS: ColorOption[] = [
    { id: "sky",    label: "ฟ้า",       cls: "bg-sky-100    text-sky-800    dark:bg-sky-900/40    dark:text-sky-200",    swatch: "#38bdf8" },
    { id: "blue",   label: "น้ำเงิน",   cls: "bg-blue-100   text-blue-800   dark:bg-blue-900/40   dark:text-blue-200",   swatch: "#60a5fa" },
    { id: "violet", label: "ม่วง",      cls: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200", swatch: "#a78bfa" },
    { id: "pink",   label: "ชมพู",      cls: "bg-pink-100   text-pink-800   dark:bg-pink-900/40   dark:text-pink-200",   swatch: "#f472b6" },
    { id: "red",    label: "แดง",       cls: "bg-red-100    text-red-800    dark:bg-red-900/40    dark:text-red-200",    swatch: "#f87171" },
    { id: "orange", label: "ส้ม",       cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200", swatch: "#fb923c" },
    { id: "yellow", label: "เหลือง",    cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200", swatch: "#facc15" },
    { id: "green",  label: "เขียว",     cls: "bg-green-100  text-green-800  dark:bg-green-900/40  dark:text-green-200",  swatch: "#4ade80" },
    { id: "teal",   label: "เขียวน้ำ",  cls: "bg-teal-100   text-teal-800   dark:bg-teal-900/40   dark:text-teal-200",   swatch: "#2dd4bf" },
    { id: "slate",  label: "เทา",       cls: "bg-slate-100  text-slate-800  dark:bg-slate-900/40  dark:text-slate-200",  swatch: "#94a3b8" },
];

export function getColorOption(id: string): ColorOption {
    return COLOR_OPTIONS.find((c) => c.id === id) ?? COLOR_OPTIONS[0];
}

const STORAGE_KEY = "std_stations";

function load(): StationEntity[] {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}

function save(stations: StationEntity[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stations));
}

export function getStations(): StationEntity[] {
    return load();
}

export function createStation(data: { name: string; colorId: string; templateId?: string }): StationEntity {
    const stations = load();
    const entity: StationEntity = {
        _id:       crypto.randomUUID(),
        name:      data.name,
        colorId:   data.colorId,
        templateId: data.templateId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    save([...stations, entity]);
    return entity;
}

export function updateStation(id: string, data: { name: string; colorId: string; templateId?: string }): void {
    const stations = load().map((s) =>
        s._id === id ? { ...s, ...data, updatedAt: new Date().toISOString() } : s
    );
    save(stations);
}

export function deleteStation(id: string): void {
    save(load().filter((s) => s._id !== id));
}
