import { fetchApi } from "./config";
import { ApiResponse, Notification } from "./types";

export const notificationsApi = {
    getAll: async (): Promise<ApiResponse<Notification[]>> => {
        return fetchApi<ApiResponse<Notification[]>>("/notifications", {
            method: "GET",
        });
    },

    getById: async (id: string): Promise<ApiResponse<Notification>> => {
        return fetchApi<ApiResponse<Notification>>(`/notifications/${id}`, {
            method: "GET",
        });
    },

    markAsRead: async (id: string): Promise<ApiResponse<Notification>> => {
        return fetchApi<ApiResponse<Notification>>(`/notifications/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ readStatus: true }),
        });
    },

    markAllRead: async (ids: string[]): Promise<ApiResponse<unknown>> => {
        return Promise.all(
            ids.map((id) =>
                fetchApi<ApiResponse<Notification>>(`/notifications/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ readStatus: true }),
                })
            )
        ).then(() => ({ success: true, message: "All marked as read", data: null }));
    },

    delete: async (id: string): Promise<ApiResponse<unknown>> => {
        return fetchApi<ApiResponse<unknown>>(`/notifications/${id}`, {
            method: "DELETE",
        });
    },
};
