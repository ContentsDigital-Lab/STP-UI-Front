import { fetchApi } from "./config";
import { ApiResponse } from "./types";
import { StationTemplate, CreateStationTemplateDto } from "@/lib/types/station-designer";

export async function getStationTemplates(): Promise<StationTemplate[]> {
    try {
        const res = await fetchApi<ApiResponse<StationTemplate[]>>("/station-templates");
        return res.success ? res.data : [];
    } catch {
        return [];
    }
}

export async function getStationTemplate(id: string): Promise<StationTemplate | null> {
    try {
        const res = await fetchApi<ApiResponse<StationTemplate>>(`/station-templates/${id}`);
        return res.success ? res.data : null;
    } catch {
        return null;
    }
}

export async function createStationTemplate(dto: CreateStationTemplateDto): Promise<StationTemplate> {
    const res = await fetchApi<ApiResponse<StationTemplate>>("/station-templates", {
        method: "POST",
        body: JSON.stringify(dto),
    });
    return res.data;
}

export async function updateStationTemplate(
    id: string,
    patch: Partial<CreateStationTemplateDto>,
): Promise<StationTemplate> {
    const res = await fetchApi<ApiResponse<StationTemplate>>(`/station-templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
    });
    return res.data;
}

export async function deleteStationTemplate(id: string): Promise<boolean> {
    await fetchApi(`/station-templates/${id}`, { method: "DELETE" });
    return true;
}

/** Clone a template into a new record (new _id). Name gets a “(สำเนา)” suffix. */
export async function duplicateStationTemplate(id: string): Promise<StationTemplate> {
    const src = await getStationTemplate(id);
    if (!src) throw new Error("Template not found");
    const uiSchema =
        src.uiSchema && typeof src.uiSchema === "object" && !Array.isArray(src.uiSchema)
            ? (JSON.parse(JSON.stringify(src.uiSchema)) as Record<string, unknown>)
            : {};
    return createStationTemplate({
        name: `${src.name} (สำเนา)`,
        uiSchema,
    });
}
