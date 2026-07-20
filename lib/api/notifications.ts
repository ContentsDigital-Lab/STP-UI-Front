import { fetchApi } from "./config";
import { ApiResponse, Notification } from "./types";

export const notificationsApi = {
    getAll: async (params?: { limit?: number }): Promise<ApiResponse<Notification[]>> => {
        const q = new URLSearchParams();
        q.set("limit", String(params?.limit ?? 100));
        return fetchApi<ApiResponse<Notification[]>>(`/notifications?${q.toString()}`, {
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
        await Promise.allSettled(
            ids.map((id) =>
                fetchApi<ApiResponse<Notification>>(`/notifications/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ readStatus: true }),
                })
            )
        );
        return { success: true, message: "All marked as read", data: null };
    },

    delete: async (id: string): Promise<ApiResponse<unknown>> => {
        return fetchApi<ApiResponse<unknown>>(`/notifications/${id}`, {
            method: "DELETE",
        });
    },
};
