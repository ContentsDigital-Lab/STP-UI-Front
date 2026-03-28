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
};
