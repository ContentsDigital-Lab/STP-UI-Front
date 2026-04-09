import { ApiError } from "@/lib/api/api-error";
import type { Pane } from "@/lib/api/types";

const MERGED_CODES = new Set(["MERGED_INTO", "MERGED_INTO_PANE", "PANE_MERGED"]);

function pickPaneNumber(obj: unknown): string | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const pn = o.paneNumber ?? o.pane_number;
  return typeof pn === "string" ? pn : null;
}

/** Merge top-level and `errors: { code, survivorPaneNumber }` shapes from API 400. */
function errorHints(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  const err = body.errors;
  if (err && typeof err === "object" && !Array.isArray(err)) {
    const e = err as Record<string, unknown>;
    if (typeof e.code === "string" && out.code == null) out.code = e.code;
    if (typeof e.survivorPaneNumber === "string" && out.survivorPaneNumber == null) {
      out.survivorPaneNumber = e.survivorPaneNumber;
    }
    if (typeof e.survivor_pane_number === "string" && out.survivor_pane_number == null) {
      out.survivor_pane_number = e.survivor_pane_number;
    }
    if (e.survivor && out.survivor == null) out.survivor = e.survivor;
    if (e.mergedInto && out.mergedInto == null) out.mergedInto = e.mergedInto;
  }
  return out;
}

export function getMergedIntoSurvivorFromError(err: unknown): {
  paneNumber: string;
  pane?: Pane;
} | null {
  if (!(err instanceof ApiError)) return null;

  const body = errorHints(err.body);
  const rawCode = (typeof body.code === "string" ? body.code : err.code) ?? "";
  const codeNorm = rawCode.toUpperCase().replace(/-/g, "_");

  const byCode = MERGED_CODES.has(codeNorm);
  const hasSurvivorField =
    typeof body.survivorPaneNumber === "string" ||
    typeof body.survivor_pane_number === "string" ||
    (body.survivor && typeof body.survivor === "object") ||
    (body.mergedInto && typeof body.mergedInto === "object") ||
    (body.merged_into && typeof body.merged_into === "object");

  const msg = String(body.message ?? err.message ?? "");
  if (!byCode && !(hasSurvivorField && /merge/i.test(msg))) {
    return null;
  }

  const direct =
    typeof body.survivorPaneNumber === "string"
      ? body.survivorPaneNumber
      : typeof body.survivor_pane_number === "string"
        ? body.survivor_pane_number
        : null;

  const survivorObj = body.survivor ?? body.survivorPane ?? body.mergedInto ?? body.merged_into;
  const fromObj = pickPaneNumber(survivorObj);

  const paneNumber = direct ?? fromObj;
  if (!paneNumber) return null;

  const pane =
    survivorObj && typeof survivorObj === "object" && "_id" in (survivorObj as object)
      ? (survivorObj as Pane)
      : undefined;

  return { paneNumber, pane };
}

export async function withMergedIntoScanRetry<T>(
  initialPaneNumber: string,
  op: (paneNumber: string) => Promise<T>,
  maxAttempts = 2,
): Promise<T> {
  let current = initialPaneNumber;
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await op(current);
    } catch (e) {
      lastErr = e;
      const next = getMergedIntoSurvivorFromError(e);
      if (!next?.paneNumber || next.paneNumber === current) throw e;
      current = next.paneNumber;
    }
  }
  throw lastErr;
}
