export const API_BASE_URL = "https://std.specterint.org/api";

export async function fetchApi<T>(
    endpoint: string,
    options: RequestInit = {}
): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;

    // Get token from localStorage if available (for client-side)
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

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || "An error occurred while fetching data.");
    }

    return data;
}
