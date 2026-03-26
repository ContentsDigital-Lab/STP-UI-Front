import { fetchApi } from "./config";
import { ApiResponse } from "./types";

export interface JobType {
    _id: string;
    name: string;
    code: string;
    description?: string;
    sheetsPerPane: number;
    defaultRawGlassTypes: string[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

export const jobTypesApi = {
    getAll: (): Promise<ApiResponse<JobType[]>> =>
        fetchApi<ApiResponse<JobType[]>>("/job-types", { method: "GET" }),

    getById: (id: string): Promise<ApiResponse<JobType>> =>
        fetchApi<ApiResponse<JobType>>(`/job-types/${id}`, { method: "GET" }),

    create: (data: Omit<JobType, "_id" | "createdAt" | "updatedAt">): Promise<ApiResponse<JobType>> =>
        fetchApi<ApiResponse<JobType>>("/job-types", {
            method: "POST",
            body: JSON.stringify(data),
        }),

    update: (id: string, data: Partial<Omit<JobType, "_id" | "createdAt" | "updatedAt">>): Promise<ApiResponse<JobType>> =>
        fetchApi<ApiResponse<JobType>>(`/job-types/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),

    delete: (id: string): Promise<ApiResponse<void>> =>
        fetchApi<ApiResponse<void>>(`/job-types/${id}`, { method: "DELETE" }),

    deleteMany: (ids: string[]): Promise<ApiResponse<void>> =>
        fetchApi<ApiResponse<void>>("/job-types", {
            method: "DELETE",
            body: JSON.stringify({ ids }),
        }),
};
