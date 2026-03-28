import { fetchApi } from "./config";
import { ApiResponse, PaneLog, TimelineEvent } from "./types";

export const productionLogsApi = {
    getAll: async (params?: {
        station?: string;
        action?: string;
        orderId?: string;
        paneId?: string;
        materialId?: string;
        limit?: number;
    }): Promise<ApiResponse<PaneLog[]>> => {
        const qs = new URLSearchParams();
        if (params?.station)    qs.set("station",    params.station);
        if (params?.action)     qs.set("action",     params.action);
        if (params?.orderId)    qs.set("orderId",    params.orderId);
        if (params?.paneId)     qs.set("paneId",     params.paneId);
        if (params?.materialId) qs.set("materialId", params.materialId);
        if (params?.limit)      qs.set("limit",      String(params.limit));
        const query = qs.toString();
        return fetchApi<ApiResponse<PaneLog[]>>(`/production-logs${query ? `?${query}` : ""}`);
    },

    getTimeline: async (materialId: string): Promise<ApiResponse<TimelineEvent[]>> => {
        return fetchApi<ApiResponse<TimelineEvent[]>>(
            `/pane-logs/timeline?materialId=${encodeURIComponent(materialId)}`
        );
    },
};
