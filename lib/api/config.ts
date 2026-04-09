import { ApiError } from "./api-error";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "https://std.specterint.org/api";

let isRedirectingToLogin = false;

function handleUnauthorized() {
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/login") return;
    if (isRedirectingToLogin) return;

    isRedirectingToLogin = true;
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    sessionStorage.setItem("session_expired", "true");
    window.location.href = "/login";
}

export async function fetchApi<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    let token = "";
    if (typeof window !== "undefined") {
        token = localStorage.getItem("auth_token") || "";
    }

    const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const response = await fetch(url, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        handleUnauthorized();
    }

    let data: Record<string, unknown> = {};
    try {
        const text = await response.text();
        if (text) data = JSON.parse(text) as Record<string, unknown>;
    } catch {
        data = {};
    }

    if (!response.ok) {
        let errorMessage =
            (typeof data.message === "string" && data.message) ||
            (typeof data.error === "string" && data.error) ||
            "An error occurred while fetching data.";

        if (data.errors) {
            const details = Array.isArray(data.errors)
                ? data.errors.map((e: { path?: string[]; message?: string } | string) => {
                    if (typeof e === "string") return e;
                    const path = Array.isArray(e.path) && e.path.length > 0 ? `[${e.path.join(".")}]` : "";
                    const msg  = e.message ?? String(e);
                    return path ? `${path} ${msg}` : msg;
                }).join(", ")
                : typeof data.errors === "object"
                    ? Object.entries(data.errors as Record<string, unknown>)
                        .map(([k, v]) => `[${k}] ${Array.isArray(v) ? v.join(", ") : String(v)}`)
                        .join(", ")
                    : String(data.errors);
            errorMessage += `: ${details}`;
        }

        if (typeof data.message !== "string" || !data.message) {
            data = { ...data, message: errorMessage };
        }

        throw new ApiError(response.status, data);
    }

    return data as T;
}
