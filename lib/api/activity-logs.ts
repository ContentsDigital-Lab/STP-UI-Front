import { fetchApi } from "./config";
import { ApiResponse, ActivityLog } from "./types";

export const activityLogsApi = {
    getAll: async (params?: {
        order?: string;
        request?: string;
        limit?: number;
    }): Promise<ApiResponse<ActivityLog[]>> => {
        const qs = new URLSearchParams();
        if (params?.order) qs.set("order", params.order);
        if (params?.request) qs.set("request", params.request);
        if (params?.limit) qs.set("limit", String(params.limit));
        
        const query = qs.toString();
        return fetchApi<ApiResponse<ActivityLog[]>>(`/activity-logs${query ? `?${query}` : ""}`);
    },
};
