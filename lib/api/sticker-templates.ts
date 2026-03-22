import { fetchApi } from "./config";
import { ApiResponse } from "./types";

export interface StickerTemplateRecord {
    _id: string;
    name: string;
    width: number;
    height: number;
    elements: unknown[];
    createdAt: string;
    updatedAt: string;
}

interface ListResponse {
    success: boolean;
    data: StickerTemplateRecord[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function getStickerTemplates(page = 1, limit = 20): Promise<StickerTemplateRecord[]> {
    try {
        const res = await fetchApi<ListResponse>(`/sticker-templates?page=${page}&limit=${limit}`);
        return res.data ?? [];
    } catch {
        return [];
    }
}

export async function getStickerTemplate(id: string): Promise<StickerTemplateRecord | null> {
    try {
        const res = await fetchApi<ApiResponse<StickerTemplateRecord>>(`/sticker-templates/${id}`);
        return res.success ? res.data : null;
    } catch {
        return null;
    }
}

export async function createStickerTemplate(dto: {
    name: string;
    width: number;
    height: number;
    elements: unknown[];
}): Promise<StickerTemplateRecord> {
    const res = await fetchApi<ApiResponse<StickerTemplateRecord>>("/sticker-templates", {
        method: "POST",
        body: JSON.stringify(dto),
    });
    return res.data;
}

export async function updateStickerTemplate(
    id: string,
    patch: { name?: string; width?: number; height?: number; elements?: unknown[] },
): Promise<StickerTemplateRecord> {
    const res = await fetchApi<ApiResponse<StickerTemplateRecord>>(`/sticker-templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
    });
    return res.data;
}

export async function deleteStickerTemplate(id: string): Promise<boolean> {
    await fetchApi(`/sticker-templates/${id}`, { method: "DELETE" });
    return true;
}
