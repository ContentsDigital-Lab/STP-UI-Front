import { fetchApi } from "./config";
import { ApiResponse, LoginData } from "./types";

export const authApi = {
    login: async (username: string, password: string): Promise<ApiResponse<LoginData>> => {
        return fetchApi<ApiResponse<LoginData>>("/auth/login", {
            method: "POST",
            body: JSON.stringify({ username, password }),
        });
    },

    getProfile: async (): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>("/auth/get-current-worker-profile", {
            method: "GET",
        });
    },

    logout: async (): Promise<ApiResponse<any>> => {
        return fetchApi<ApiResponse<any>>("/auth/logout", {
            method: "POST",
        });
    }
};
