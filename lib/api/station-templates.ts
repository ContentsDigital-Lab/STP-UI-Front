// Station Templates API
// Currently backed by localStorage — swap STORAGE_MOCK to false when backend API is ready

import { StationTemplate, CreateStationTemplateDto } from "@/lib/types/station-designer";

const STORAGE_MOCK = true;
const STORAGE_KEY  = "std_station_templates";
const API_BASE     = "/api/station-templates";

// ─── Mock helpers ───────────────────────────────────────────────────────────

function readMock(): StationTemplate[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? (JSON.parse(raw) as StationTemplate[]) : [];
    } catch {
        return [];
    }
}

function writeMock(templates: StationTemplate[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function newId() {
    return `tmpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── API functions ──────────────────────────────────────────────────────────

export async function getStationTemplates(): Promise<StationTemplate[]> {
    if (STORAGE_MOCK) {
        return readMock();
    }
    const res = await fetch(API_BASE);
    const json = await res.json();
    return json.data as StationTemplate[];
}

export async function getStationTemplate(id: string): Promise<StationTemplate | null> {
    if (STORAGE_MOCK) {
        return readMock().find((t) => t._id === id) ?? null;
    }
    const res = await fetch(`${API_BASE}/${id}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as StationTemplate;
}

export async function createStationTemplate(dto: CreateStationTemplateDto): Promise<StationTemplate> {
    if (STORAGE_MOCK) {
        const now  = new Date().toISOString();
        const tmpl: StationTemplate = {
            _id: newId(),
            name: dto.name,
            description: dto.description,
            craftNodes: dto.craftNodes ?? {},
            createdAt: now,
            updatedAt: now,
        };
        const list = readMock();
        list.unshift(tmpl);
        writeMock(list);
        return tmpl;
    }
    const res  = await fetch(API_BASE, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dto) });
    const json = await res.json();
    return json.data as StationTemplate;
}

export async function updateStationTemplate(
    id: string,
    patch: Partial<CreateStationTemplateDto> & { craftNodes?: Record<string, unknown> },
): Promise<StationTemplate | null> {
    if (STORAGE_MOCK) {
        const list = readMock();
        const idx  = list.findIndex((t) => t._id === id);
        if (idx === -1) return null;
        list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
        writeMock(list);
        return list[idx];
    }
    const res  = await fetch(`${API_BASE}/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const json = await res.json();
    return json.data as StationTemplate;
}

export async function deleteStationTemplate(id: string): Promise<boolean> {
    if (STORAGE_MOCK) {
        const list = readMock().filter((t) => t._id !== id);
        writeMock(list);
        return true;
    }
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
    return res.ok;
}
