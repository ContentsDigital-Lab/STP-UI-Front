import { fetchApi } from "./config";
import { ApiResponse, PaneLog } from "./types";

export const paneLogsApi = {
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
        return fetchApi<ApiResponse<PaneLog[]>>(`/pane-logs${query ? `?${query}` : ""}`);
    },

    getTimeline: async (materialId: string): Promise<ApiResponse<any[]>> => {
        return fetchApi<ApiResponse<any[]>>(
            `/pane-logs/timeline?materialId=${encodeURIComponent(materialId)}`
        );
    },

    getOrderTimeline: async (params: { orderId?: string; requestId?: string; limit?: number }): Promise<ApiResponse<any[]>> => {
        const qs = new URLSearchParams();
        if (params.orderId) qs.set("orderId", params.orderId);
        if (params.requestId) qs.set("requestId", params.requestId);
        if (params.limit) qs.set("limit", params.limit.toString());
        return fetchApi<ApiResponse<any[]>>(`/pane-logs/order-timeline?${qs.toString()}`);
    },
};
