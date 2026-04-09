"use client";

import { useState, useEffect } from "react";
import { Package, X, Factory, CheckCheck, Loader2 } from "lucide-react";
import { panesApi } from "@/lib/api/panes";
import { paneLogsApi } from "@/lib/api/pane-logs";
import { getColorOption } from "@/lib/stations/stations-store";
import { Pane, PaneLog, Station } from "@/lib/api/types";
import { getStationId, getStationName, isStationMatch } from "@/lib/utils/station-helpers";

const fmtTime = (d?: string) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function fmtDuration(ms: number): string {
  if (ms <= 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} วินาที`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm > 0 ? `${h} ชม. ${rm} น.` : `${h} ชม.`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d} วัน ${rh} ชม.` : `${d} วัน`;
}

// ── labeled field row helper ──────────────────────────────────────────────────
function PaneField({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  accent?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 min-w-0">
      <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 w-24 shrink-0 pt-0.5">
        {label}
      </span>
      <span
        className={`text-sm font-medium break-all min-w-0 ${accent ?? "text-slate-800 dark:text-slate-200"} ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

// ── pane detail modal ─────────────────────────────────────────────────────────
export function PaneDetailModal({
  pane,
  stationMap,
  stationByName,
  onClose,
}: {
  pane: Pane;
  stationMap: Map<string, Station>;
  stationByName: Map<string, Station>;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<PaneLog[]>([]);
  const [childPanes, setChildPanes] = useState<Pane[]>([]);
  const [childLogs, setChildLogs] = useState<PaneLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      setLogs([]);
      setChildPanes([]);
      setChildLogs([]);
      try {
        const childIds = (pane.laminateRole === "parent" && pane.childPanes?.length)
          ? pane.childPanes.map(c => typeof c === "string" ? c : c._id)
          : [];

        const [logRes, ...childResults] = await Promise.all([
          paneLogsApi.getAll({ paneId: pane._id, limit: 300 }),
          ...childIds.flatMap(cid => [
            panesApi.getById(cid),
            paneLogsApi.getAll({ paneId: cid, limit: 300 }),
          ]),
        ]);

        if (cancelled) return;

        if (logRes.success) setLogs(logRes.data ?? []);

        if (childIds.length > 0) {
          const fetched: Pane[] = [];
          const allChildLogs: PaneLog[] = [];
          for (let i = 0; i < childIds.length; i++) {
            const cPane = childResults[i * 2] as Awaited<ReturnType<typeof panesApi.getById>>;
            const cLogs = childResults[i * 2 + 1] as Awaited<ReturnType<typeof paneLogsApi.getAll>>;
            if (cPane.success && cPane.data) fetched.push(cPane.data);
            if (cLogs.success) allChildLogs.push(...(cLogs.data ?? []));
          }
          setChildPanes(fetched);
          setChildLogs(allChildLogs);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [pane._id, pane.laminateRole, pane.childPanes]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const isLamParent = pane.laminateRole === "parent" && childPanes.length > 0;

  const childRouting = isLamParent ? (childPanes[0]?.routing ?? []) : [];
  const parentRouting = pane.routing ?? [];
  const routing = isLamParent
    ? [...childRouting, ...parentRouting]
    : parentRouting;

  const childRoutingLen = childRouting.length;

  const stationLogsMap = new Map<
    string,
    { scan_in?: PaneLog; start?: PaneLog; complete?: PaneLog }
  >();

  const matchLogsToRouting = (
    logsToMatch: PaneLog[],
    routeSlice: (string | { _id: string; name: string })[],
    idxOffset: number,
  ) => {
    for (const log of logsToMatch) {
      for (let i = 0; i < routeSlice.length; i++) {
        const routeRef = routeSlice[i];
        const rid = getStationId(routeRef);
        const rname = getStationName(routeRef);
        const stById = rid ? stationMap.get(rid) : undefined;
        const stByName = rname ? stationByName.get(rname) : undefined;
        const stationName = stById?.name ?? stByName?.name ?? rname ?? rid;
        const stationId = stById?._id ?? stByName?._id ?? rid;
        const mapKey = rid || `routing-${idxOffset + i}`;
        if (
          isStationMatch(log.station, stationId, stationName) ||
          isStationMatch(log.station, rid, rname)
        ) {
          if (!stationLogsMap.has(mapKey)) stationLogsMap.set(mapKey, {});
          const entry = stationLogsMap.get(mapKey)!;
          if (log.action === "scan_in" && !entry.scan_in) entry.scan_in = log;
          if (log.action === "start" && !entry.start) entry.start = log;
          if (log.action === "complete" && !entry.complete) entry.complete = log;
          break;
        }
      }
    }
  };

  if (isLamParent) {
    matchLogsToRouting(childLogs, childRouting, 0);
    matchLogsToRouting(logs, parentRouting, childRoutingLen);
  } else {
    matchLogsToRouting(logs, parentRouting, 0);
  }

  const curPaneId = getStationId(pane.currentStation);
  const curPaneName = getStationName(pane.currentStation);

  const isCompleted = pane.currentStatus === "completed";

  const currentStationIdx = (() => {
    if (isLamParent) {
      const parentIdx = parentRouting.findIndex(
        (routeRef) =>
          pane.currentStation != null &&
          isStationMatch(routeRef, curPaneId, curPaneName),
      );
      if (parentIdx >= 0) return childRoutingLen + parentIdx;
      if (isCompleted) return -1;
      const childDone = childPanes.every(c => c.currentStatus === "completed");
      if (childDone && pane.currentStatus === "pending") return childRoutingLen;
      return -1;
    }
    return routing.findIndex(
      (routeRef) =>
        pane.currentStation != null &&
        isStationMatch(routeRef, curPaneId, curPaneName),
    );
  })();

  const currentStationName = (() => {
    if (
      typeof pane.currentStation === "string" &&
      pane.currentStation === "queue"
    )
      return "คิว";
    if (
      typeof pane.currentStation === "string" &&
      pane.currentStation === "ready"
    )
      return "พร้อมส่ง";
    if (
      typeof pane.currentStation === "string" &&
      pane.currentStation === "defected"
    )
      return "ชำรุด";
    if (pane.currentStation == null) {
      if (pane.currentStatus === "pending") return "คิว";
      if (pane.currentStatus === "completed") return "เสร็จแล้ว";
      if (pane.currentStatus === "claimed") return "ถูกเคลม";
      return "—";
    }
    const pid = getStationId(pane.currentStation);
    const pname = getStationName(pane.currentStation);
    const s =
      (pid ? stationMap.get(pid) : undefined) ??
      stationByName.get(pname) ??
      (pid ? stationByName.get(pid) : undefined);
    return s?.name ?? pname ?? pid;
  })();

  const heroColor = (() => {
    if (isCompleted) return getColorOption("green");
    if (
      typeof pane.currentStation === "string" &&
      ["queue", "ready", "defected"].includes(pane.currentStation)
    ) {
      return getColorOption("slate");
    }
    if (
      pane.currentStation == null &&
      (pane.currentStatus === "pending" || pane.currentStatus === "claimed")
    ) {
      return getColorOption("slate");
    }
    if (currentStationIdx >= 0) {
      const routeRef = routing[currentStationIdx];
      const rid = getStationId(routeRef);
      const rname = getStationName(routeRef);
      const station =
        (rid ? stationMap.get(rid) : undefined) ??
        (rname ? stationByName.get(rname) : undefined) ??
        (rid ? stationByName.get(rid) : undefined);
      return getColorOption(station?.colorId ?? "sky");
    }
    return getColorOption("sky");
  })();

  const completedCount = routing.filter((_, idx) => {
    if (isCompleted) return true;
    if (isLamParent && idx < childRoutingLen) {
      const rr = routing[idx];
      const rrid = getStationId(rr);
      const mk = rrid || `routing-${idx}`;
      return !!stationLogsMap.get(mk)?.complete;
    }
    return currentStationIdx >= 0 && idx < currentStationIdx;
  }).length;

  const totalMs =
    pane.startedAt && pane.completedAt
      ? new Date(pane.completedAt).getTime() -
        new Date(pane.startedAt).getTime()
      : 0;

  const statusLabel: Record<string, string> = {
    pending: "รอดำเนินการ",
    in_progress: "กำลังดำเนินการ",
    completed: "เสร็จแล้ว",
    awaiting_scan_out: "รอสแกนออก",
    claimed: "ถูกเคลม",
  };

  const dimStr =
    pane.dimensions && (pane.dimensions.width > 0 || pane.dimensions.height > 0)
      ? `${pane.dimensions.width} × ${pane.dimensions.height}${pane.dimensions.thickness > 0 ? ` × ${pane.dimensions.thickness}` : ""} mm`
      : null;

  const rawGlassStr = pane.rawGlass
    ? [
        pane.rawGlass.glassType,
        pane.rawGlass.color,
        pane.rawGlass.thickness ? `${pane.rawGlass.thickness}mm` : null,
        pane.rawGlass.sheetsPerPane > 1
          ? `${pane.rawGlass.sheetsPerPane} แผ่น/ชิ้น`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <Package className="h-5 w-5 text-slate-400 shrink-0" />
          <span className="text-base font-bold text-slate-900 dark:text-white font-mono flex-1 truncate">
            {pane.paneNumber || pane._id.slice(-6).toUpperCase()}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 -mr-1"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── HERO: Where is this pane right now? ────── */}
          <div className="p-5 pb-4">
            <div
              className="rounded-2xl p-5"
              style={{ backgroundColor: `${heroColor.swatch}10` }}
            >
              {isCompleted ? (
                <>
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${heroColor.swatch}25` }}
                    >
                      <CheckCheck
                        className="h-4 w-4"
                        style={{ color: heroColor.swatch }}
                      />
                    </div>
                    <span
                      className="text-sm font-bold"
                      style={{ color: heroColor.swatch }}
                    >
                      ผลิตเสร็จแล้ว
                    </span>
                  </div>
                  {totalMs > 0 && (
                    <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">
                      {fmtDuration(totalMs)}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    ผ่านแล้ว {routing.length} สถานี
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                    <Factory
                      className="h-3.5 w-3.5"
                      style={{ color: heroColor.swatch }}
                    />
                    {pane.currentStatus === "awaiting_scan_out"
                      ? "เสร็จแล้ว รอสแกนออกที่"
                      : pane.currentStatus === "pending"
                        ? "รอเริ่มที่"
                        : "อยู่ที่สถานี"}
                  </p>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">
                    {currentStationName}
                  </p>
                  {pane.currentStatus === "in_progress" && (
                    <p
                      className="text-xs font-semibold mt-1.5 flex items-center gap-1"
                      style={{ color: heroColor.swatch }}
                    >
                      <Loader2 className="h-3 w-3 animate-spin" />
                      กำลังดำเนินการ
                    </p>
                  )}
                </>
              )}

              {routing.length > 0 && (
                <div className="flex items-center gap-1.5 mt-4">
                  <div className="flex items-center flex-1 min-w-0">
                    {routing.map((routeRef, idx) => {
                      const rid = getStationId(routeRef);
                      const rname = getStationName(routeRef);
                      const st =
                        (rid ? stationMap.get(rid) : undefined) ??
                        (rname ? stationByName.get(rname) : undefined) ??
                        (rid ? stationByName.get(rid) : undefined);
                      const dc = getColorOption(st?.colorId ?? "sky");
                      const dp =
                        isCompleted ||
                        (currentStationIdx >= 0 && idx < currentStationIdx);
                      const dcr = !isCompleted && idx === currentStationIdx;
                      return (
                        <div
                          key={rid || `r-${idx}`}
                          className="flex items-center flex-1"
                        >
                          <div
                            className={`shrink-0 rounded-full ${dcr ? "w-3.5 h-3.5 ring-2 ring-white dark:ring-slate-900 animate-pulse" : dp ? "w-2.5 h-2.5" : "w-2 h-2 bg-slate-200 dark:bg-slate-700"}`}
                            style={
                              dp || dcr
                                ? { backgroundColor: dc.swatch }
                                : undefined
                            }
                          />
                          {idx < routing.length - 1 && (
                            <div
                              className={`h-[3px] flex-1 mx-0.5 rounded-full ${dp ? "" : "bg-slate-200 dark:bg-slate-700"}`}
                              style={
                                dp
                                  ? { backgroundColor: `${dc.swatch}40` }
                                  : undefined
                              }
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 shrink-0 tabular-nums ml-2">
                    {isCompleted ? routing.length : completedCount}/
                    {routing.length}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Pane details — labeled fields ──────────── */}
          <div className="px-5 pb-3">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              ข้อมูลกระจก
            </p>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-1 divide-y divide-slate-100 dark:divide-slate-800/60">
              <PaneField label="หมายเลข" value={pane.paneNumber} mono />
              <PaneField label="QR Code" value={pane.qrCode} mono />
              <PaneField
                label="สถานะ"
                value={statusLabel[pane.currentStatus] ?? pane.currentStatus}
                accent={
                  isCompleted
                    ? "text-green-600 dark:text-green-400"
                    : pane.currentStatus === "in_progress"
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-amber-600 dark:text-amber-400"
                }
              />
              <PaneField label="สถานีปัจจุบัน" value={currentStationName} />
              <PaneField label="ขนาด" value={dimStr} />
              <PaneField label="กระจกดิบ" value={rawGlassStr} />
              {pane.jobType && (
                <PaneField label="ประเภทงาน" value={pane.jobType} />
              )}
              {pane.customRouting && (
                <PaneField
                  label="เส้นทาง"
                  value="กำหนดเอง (Custom)"
                  accent="text-violet-600 dark:text-violet-400"
                />
              )}
              {pane.remakeOf && (
                <PaneField
                  label="ผลิตซ้ำจาก"
                  value={typeof pane.remakeOf === "string" ? pane.remakeOf : (pane.remakeOf as unknown as Pane).paneNumber ?? (pane.remakeOf as unknown as Pane)._id}
                  mono
                  accent="text-orange-600 dark:text-orange-400"
                />
              )}
              {pane.mergedInto && (
                <PaneField
                  label="รวมเข้าแผ่น"
                  value={
                    typeof pane.mergedInto === "string"
                      ? pane.mergedInto
                      : (pane.mergedInto as Pane).paneNumber ??
                        (pane.mergedInto as Pane)._id
                  }
                  mono
                  accent="text-violet-600 dark:text-violet-400"
                />
              )}
              {pane.laminateMergedAt && (
                <PaneField
                  label="เวลาประกบลามิเนต"
                  value={fmtTime(pane.laminateMergedAt)}
                  accent="text-violet-600 dark:text-violet-400"
                />
              )}
              {pane.laminateRole === "parent" && (
                <PaneField
                  label="ลามิเนต"
                  value={`Parent — ${(pane.childPanes?.length ?? 0)} แผ่นดิบ`}
                  accent="text-violet-600 dark:text-violet-400"
                />
              )}
            </div>
          </div>

          {/* ── Processes ──────────────────────────────── */}
          {(pane.processes?.length ?? 0) > 0 && (
            <div className="px-5 pb-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                กระบวนการ
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pane.processes.map((p, i) => (
                  <span
                    key={i}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Edge tasks ─────────────────────────────── */}
          {(pane.edgeTasks?.length ?? 0) > 0 && (
            <div className="px-5 pb-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                งานขอบ
              </p>
              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                {pane.edgeTasks.map((et, i) => {
                  const etStatus =
                    et.status === "completed"
                      ? "text-green-600"
                      : et.status === "in_progress"
                        ? "text-blue-600"
                        : "text-slate-400";
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <span className="text-xs font-bold text-slate-500 w-12 shrink-0 uppercase">
                        {et.side}
                      </span>
                      <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex-1 truncate">
                        {et.edgeProfile}
                        {et.machineType ? ` (${et.machineType})` : ""}
                      </span>
                      <span
                        className={`text-[10px] font-bold shrink-0 ${etStatus}`}
                      >
                        {et.status === "completed"
                          ? "เสร็จ"
                          : et.status === "in_progress"
                            ? "กำลังทำ"
                            : "รอ"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Station journey — timeline ────────────── */}
          {routing.length > 0 && (
            <div className="px-5 pb-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                เส้นทางการผลิต
              </p>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/60">
                  {routing.map((routeRef, idx) => {
                    const isChildStation = isLamParent && idx < childRoutingLen;

                    const rid = getStationId(routeRef);
                    const rname = getStationName(routeRef);
                    const mapKey = rid || `routing-${idx}`;
                    const station =
                      (rid ? stationMap.get(rid) : undefined) ??
                      (rname ? stationByName.get(rname) : undefined) ??
                      (rid ? stationByName.get(rid) : undefined);
                    const colorId = station?.colorId ?? "sky";
                    const color = getColorOption(colorId);
                    const stLogs = stationLogsMap.get(mapKey) ?? {};
                    const isCurrent = idx === currentStationIdx && !isCompleted;
                    const parentMovedOn = isLamParent && currentStationIdx >= childRoutingLen;
                    const isPassed = isChildStation
                      ? (parentMovedOn || isCompleted || !!stLogs.complete)
                      : isCompleted || (currentStationIdx >= 0 && idx < currentStationIdx);
                    const isFuture = !isCurrent && !isPassed;

                    let duration: string | null = null;
                    if (stLogs.scan_in && stLogs.complete) {
                      const ms =
                        new Date(
                          stLogs.complete.completedAt ??
                            stLogs.complete.createdAt,
                        ).getTime() -
                        new Date(stLogs.scan_in.createdAt).getTime();
                      if (ms > 0) duration = fmtDuration(ms);
                    }

                    return (
                      <div key={mapKey}>
                        <div
                          className={`px-4 py-3`}
                          style={
                            isCurrent
                              ? { backgroundColor: `${color.swatch}08` }
                              : undefined
                          }
                        >
                        <div className="flex items-center gap-3">
                          <div
                            className={`shrink-0 rounded-full flex items-center justify-center ${
                              isCurrent
                                ? "w-5 h-5"
                                : isPassed
                                  ? "w-4 h-4"
                                  : "w-3 h-3 bg-slate-200 dark:bg-slate-700"
                            }`}
                            style={
                              isPassed || isCurrent
                                ? { backgroundColor: color.swatch }
                                : undefined
                            }
                          >
                            {isPassed && (
                              <CheckCheck className="h-2 w-2 text-white" />
                            )}
                            {isCurrent && (
                              <div className="h-2 w-2 rounded-full bg-white animate-pulse" />
                            )}
                          </div>

                          <span
                            className={`text-sm font-semibold flex-1 truncate ${isFuture ? "text-slate-300 dark:text-slate-600" : "text-slate-800 dark:text-white"}`}
                          >
                            {station?.name ?? rname ?? rid}
                          </span>

                          {isCurrent && (
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                              style={{
                                color: color.swatch,
                                backgroundColor: `${color.swatch}15`,
                              }}
                            >
                              อยู่ที่นี่
                            </span>
                          )}
                          {isPassed && duration && (
                            <span className="text-[11px] font-semibold text-slate-400 shrink-0 tabular-nums">
                              {duration}
                            </span>
                          )}
                        </div>

                        {/* Timestamps under each station — only for passed stations */}
                        {isPassed &&
                          (stLogs.scan_in || stLogs.complete ? (
                            <div className="ml-8 mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                              {stLogs.scan_in && (
                                <span>
                                  เข้า {fmtTime(stLogs.scan_in.createdAt)}
                                </span>
                              )}
                              {stLogs.start && (
                                <span>
                                  เริ่ม {fmtTime(stLogs.start.createdAt)}
                                </span>
                              )}
                              {stLogs.complete && (
                                <span className="text-green-500">
                                  เสร็จ{" "}
                                  {fmtTime(
                                    stLogs.complete.completedAt ??
                                      stLogs.complete.createdAt,
                                  )}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="ml-8 mt-1 text-[10px] text-slate-300 dark:text-slate-600 italic">
                              ไม่มีข้อมูลเวลา
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Timestamps — overall ─────────────────── */}
          <div className="px-5 pb-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              ไทม์ไลน์
            </p>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-1 divide-y divide-slate-100 dark:divide-slate-800/60">
              <PaneField label="สร้างเมื่อ" value={fmtTime(pane.createdAt)} />
              <PaneField
                label="เริ่มผลิต"
                value={pane.startedAt ? fmtTime(pane.startedAt) : null}
              />
              <PaneField
                label="ผลิตเสร็จ"
                value={pane.completedAt ? fmtTime(pane.completedAt) : null}
                accent="text-green-600 dark:text-green-400"
              />
              <PaneField
                label="ส่งมอบ"
                value={pane.deliveredAt ? fmtTime(pane.deliveredAt) : null}
                accent="text-blue-600 dark:text-blue-400"
              />
              {totalMs > 0 && (
                <PaneField
                  label="ระยะเวลารวม"
                  value={fmtDuration(totalMs)}
                  accent="text-slate-800 dark:text-white"
                />
              )}
              <PaneField label="อัพเดทล่าสุด" value={fmtTime(pane.updatedAt)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
