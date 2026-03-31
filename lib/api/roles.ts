import { fetchApi } from "./config";
import type { ApiResponse, PaginatedResponse, Role } from "./types";

export const rolesApi = {
    getAll: async (params?: { page?: number; limit?: number }): Promise<PaginatedResponse<Role>> => {
        const q = new URLSearchParams();
        if (params?.page) q.set("page", String(params.page));
        if (params?.limit) q.set("limit", String(params.limit));
        const qs = q.toString();
        return fetchApi<PaginatedResponse<Role>>(`/roles${qs ? `?${qs}` : ""}`, { method: "GET" });
    },

    getById: async (id: string): Promise<ApiResponse<Role>> => {
        return fetchApi<ApiResponse<Role>>(`/roles/${id}`, { method: "GET" });
    },

    getPermissions: async (): Promise<ApiResponse<string[]>> => {
        return fetchApi<ApiResponse<string[]>>("/roles/permissions", { method: "GET" });
    },

    create: async (data: { name: string; slug: string; permissions: string[] }): Promise<ApiResponse<Role>> => {
        return fetchApi<ApiResponse<Role>>("/roles", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<{ name: string; slug: string; permissions: string[] }>): Promise<ApiResponse<Role>> => {
        return fetchApi<ApiResponse<Role>>(`/roles/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string): Promise<ApiResponse<unknown>> => {
        return fetchApi<ApiResponse<unknown>>(`/roles/${id}`, { method: "DELETE" });
    },
};
