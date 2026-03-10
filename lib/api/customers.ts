import { fetchApi } from "./config";
import { ApiResponse, Customer } from "./types";

export const customersApi = {
    getAll: async (): Promise<ApiResponse<Customer[]>> => {
        return fetchApi<ApiResponse<Customer[]>>("/customers", {
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
