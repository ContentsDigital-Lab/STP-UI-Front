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

// ── Request Deduplication ───────────────────────────────────────────────────
// Track active GET requests to prevent "fetch storms" when multiple components 
// trigger the same data refresh simultaneously.
const inflightRequests = new Map<string, Promise<any>>();

export async function fetchApi<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    // 1. Normalize URL to prevent concatenation bugs (e.g. apicontext)
    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const baseUrl = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const url = `${baseUrl}${normalizedEndpoint}`;

    const method = options.method?.toUpperCase() || "GET";
    const isGet  = method === "GET";
    const cacheKey = `${method}:${url}`;

    // 2. Return existing promise if this GET request is already in progress
    if (isGet && inflightRequests.has(cacheKey)) {
        // console.log(`[Dedupe] Sharing inflight request for: ${url}`);
        return inflightRequests.get(cacheKey) as Promise<T>;
    }

    const performRequest = async (): Promise<T> => {
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

        const data = await response.json();

        if (!response.ok) {
            let errorMessage = data.message || "An error occurred while fetching data.";

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

            throw new Error(errorMessage);
        }

        return data;
    };

    const requestPromise = (async () => {
        try {
            return await performRequest();
        } finally {
            if (isGet) inflightRequests.delete(cacheKey);
        }
    })();

    if (isGet) inflightRequests.set(cacheKey, requestPromise);
    return requestPromise;
}
