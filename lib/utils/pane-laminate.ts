import type { Pane } from "@/lib/api/types";

/** Pane retired by laminate merge — hide from normal floor lists. */
export function isPaneRetiredByMerge(p: Pane): boolean {
  return Boolean(p.mergedInto);
}

/** Follow populated mergedInto to the survivor pane for station checks. */
export function resolveActivePane(p: Pane): Pane {
  const into = p.mergedInto;
  if (!into) return p;
  if (typeof into === "object" && into !== null && "_id" in into) {
    return into as Pane;
  }
  return p;
}
