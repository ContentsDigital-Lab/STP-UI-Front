import { fetchApi } from "./config";
import { ApiResponse, Worker } from "./types";

export const workersApi = {
    getAll: async (): Promise<ApiResponse<Worker[]>> => {
        return fetchApi<ApiResponse<Worker[]>>("/workers", {
            method: "GET",
        });
    },

    getById: async (id: string): Promise<ApiResponse<Worker>> => {
        return fetchApi<ApiResponse<Worker>>(`/workers/${id}`, {
            method: "GET",
        });
    },

    create: async (data: Partial<Worker>): Promise<ApiResponse<Worker>> => {
        return fetchApi<ApiResponse<Worker>>("/workers", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<Worker>): Promise<ApiResponse<Worker>> => {
        return fetchApi<ApiResponse<Worker>>(`/workers/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>(`/workers/${id}`, {
            method: "DELETE",
        });
    },

    deleteMultiple: async (ids: string[]): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>("/workers", {
            method: "DELETE",
            body: JSON.stringify({ ids }),
        });
    }
};
