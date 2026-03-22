import { fetchApi } from "./config";
import { ApiResponse } from "./types";
import { PricingSettings } from "../pricing-settings";

export const pricingSettingsApi = {
    get: async (): Promise<ApiResponse<PricingSettings>> => {
        return fetchApi<ApiResponse<PricingSettings>>("/pricing-settings", {
            method: "GET",
        });
    },

    update: async (data: Partial<PricingSettings>): Promise<ApiResponse<PricingSettings>> => {
        return fetchApi<ApiResponse<PricingSettings>>("/pricing-settings", {
            method: "PUT",
            body: JSON.stringify(data),
        });
    },
};
