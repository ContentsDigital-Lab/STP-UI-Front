import { fetchApi } from "./config";
import { ApiResponse } from "./types";

export interface StickerSettingsResponse {
    _id?: string;
    singleton?: boolean;
    laminateTemplateId?: string | { _id: string; name?: string } | null;
    standardTemplateId?: string | { _id: string; name?: string } | null;
    updatedBy?: { _id: string; name: string; role?: string } | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface StickerMappingSettings {
    laminateTemplateId?: string;
    standardTemplateId?: string;
}

function parseSettingsData(data: StickerSettingsResponse | null | undefined): StickerMappingSettings {
    if (!data) return {};
    
    const lamId = typeof data.laminateTemplateId === "object" && data.laminateTemplateId !== null
        ? data.laminateTemplateId._id
        : (data.laminateTemplateId || "");

    const stdId = typeof data.standardTemplateId === "object" && data.standardTemplateId !== null
        ? data.standardTemplateId._id
        : (data.standardTemplateId || "");

    return {
        laminateTemplateId: lamId || "",
        standardTemplateId: stdId || "",
    };
}

export const stickerSettingsApi = {
    get: async (): Promise<StickerMappingSettings> => {
        try {
            const res = await fetchApi<ApiResponse<StickerSettingsResponse>>("/sticker-settings", {
                method: "GET",
            });
            if (res && res.success && res.data) {
                return parseSettingsData(res.data);
            }
            return {};
        } catch (error) {
            console.warn("Failed to fetch sticker settings from backend:", error);
            return {};
        }
    },

    update: async (data: Partial<StickerMappingSettings>): Promise<StickerMappingSettings> => {
        const payload = {
            laminateTemplateId: data.laminateTemplateId ?? null,
            standardTemplateId: data.standardTemplateId ?? null,
        };
        const res = await fetchApi<ApiResponse<StickerSettingsResponse>>("/sticker-settings", {
            method: "PUT",
            body: JSON.stringify(payload),
        });
        if (res && res.success && res.data) {
            return parseSettingsData(res.data);
        }
        return {};
    },
};
