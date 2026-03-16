import { fetchApi } from "./config";
import { ApiResponse, Station } from "./types";

export const stationsApi = {
    getAll: async (): Promise<ApiResponse<Station[]>> => {
        return fetchApi<ApiResponse<Station[]>>("/stations", { method: "GET" });
    },

    getById: async (id: string): Promise<ApiResponse<Station>> => {
        return fetchApi<ApiResponse<Station>>(`/stations/${id}`, { method: "GET" });
    },

    create: async (data: Partial<Station>): Promise<ApiResponse<Station>> => {
        return fetchApi<ApiResponse<Station>>("/stations", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<Station>): Promise<ApiResponse<Station>> => {
        return fetchApi<ApiResponse<Station>>(`/stations/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string): Promise<ApiResponse<unknown>> => {
        return fetchApi<ApiResponse<unknown>>(`/stations/${id}`, { method: "DELETE" });
    },
};
