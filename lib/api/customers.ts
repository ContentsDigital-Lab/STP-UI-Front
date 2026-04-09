import { fetchApi } from "./config";
import { ApiResponse, Customer, PaginatedResponse } from "./types";

export const customersApi = {
    /**
     * List customers. Defaults: page 1, limit 100 (for dropdowns). Pass page + limit for table pagination.
     */
    getAll: async (params?: {
        page?: number;
        limit?: number;
        sort?: string;
    }): Promise<PaginatedResponse<Customer>> => {
        const q = new URLSearchParams();
        const page = params?.page ?? 1;
        const limit = params?.limit ?? 100;
        q.set("page", String(page));
        q.set("limit", String(limit));
        if (params?.sort) q.set("sort", params.sort);
        return fetchApi<PaginatedResponse<Customer>>(`/customers?${q.toString()}`, {
            method: "GET",
        });
    },

    getById: async (id: string): Promise<ApiResponse<Customer>> => {
        return fetchApi<ApiResponse<Customer>>(`/customers/${id}`, {
            method: "GET",
        });
    },

    create: async (data: Partial<Customer>): Promise<ApiResponse<Customer>> => {
        return fetchApi<ApiResponse<Customer>>("/customers", {
            method: "POST",
            body: JSON.stringify(data),
        });
    },

    update: async (id: string, data: Partial<Customer>): Promise<ApiResponse<Customer>> => {
        return fetchApi<ApiResponse<Customer>>(`/customers/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        });
    },

    delete: async (id: string): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>(`/customers/${id}`, {
            method: "DELETE",
        });
    },

    deleteMultiple: async (ids: string[]): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>("/customers", {
            method: "DELETE",
            body: JSON.stringify({ ids }),
        });
    }
};
