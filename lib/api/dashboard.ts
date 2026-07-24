import { fetchApi } from "./config";
import { ApiResponse, DashboardStats } from "./types";

export const dashboardApi = {
    getStats: async (chartRange: string = "7d"): Promise<ApiResponse<DashboardStats>> => {
        return fetchApi<ApiResponse<DashboardStats>>(`/dashboard/stats?chartRange=${chartRange}`, {
            method: "GET",
        });
    },
};
