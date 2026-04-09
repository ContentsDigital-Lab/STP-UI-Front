/**
 * Thrown by fetchApi on non-2xx so callers can read structured fields
 * (e.g. MERGED_INTO, survivorPaneNumber in body or body.errors).
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    const msg =
      typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : "Request failed";
    super(msg);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  get code(): string | undefined {
    const c = this.body.code ?? this.body.errorCode;
    if (typeof c === "string") return c;
    const err = this.body.errors;
    if (err && typeof err === "object" && !Array.isArray(err) && typeof (err as Record<string, unknown>).code === "string") {
      return (err as Record<string, unknown>).code as string;
    }
    return undefined;
  }
}

/** Human-readable text from `fetchApi` / `ApiError` (message + formatted errors). */
export function getApiErrorMessage(error: unknown, fallback = "เกิดข้อผิดพลาด"): string {
  if (error instanceof ApiError) {
    const m = error.message?.trim();
    return m || fallback;
  }
  if (error instanceof Error) {
    const m = error.message?.trim();
    return m || fallback;
  }
  return fallback;
}
