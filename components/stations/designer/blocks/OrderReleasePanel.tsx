"use client";

import { useNode } from "@craftjs/core";
import { useEffect, useState, useMemo } from "react";
import {
  ClipboardList,
  Package,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Rocket,
  Loader2,
  ShieldCheck,
  Clock,
  AlertOctagon,
} from "lucide-react";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { inventoriesApi } from "@/lib/api/inventories";
import { ordersApi } from "@/lib/api/orders";
import { panesApi } from "@/lib/api/panes";
import { stationsApi } from "@/lib/api/stations";
import {
  Order,
  Inventory,
  Material,
  Station,
  OrderRequest,
  Customer,
} from "@/lib/api/types";
import { getStationId } from "@/lib/utils/station-helpers";

interface OrderReleasePanelProps {
  title?: string;
  maxItems?: number;
  showStockCheck?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolveMat(m: unknown): Material | null {
  if (!m || typeof m === "string") return null;
  return m as Material;
}
function matId(m: unknown) {
  return resolveMat(m)?._id ?? (typeof m === "string" ? m : "");
}
function matName(m: unknown) {
  return resolveMat(m)?.name ?? (typeof m === "string" ? m : "-");
}
function matUnit(m: unknown) {
  return resolveMat(m)?.unit ?? "ชิ้น";
}
function matSpecs(m: unknown) {
  const mat = resolveMat(m);
  if (!mat) return "";
  const s = mat.specDetails;
  return [s.glassType, s.thickness, s.color].filter(Boolean).join(" • ");
}

function resolveReq(r: unknown): OrderRequest | null {
  if (!r || typeof r === "string") return null;
  return r as OrderRequest;
}
function resolveCus(c: unknown): Customer | null {
  if (!c || typeof c === "string") return null;
  return c as Customer;
}
function cusName(c: unknown): string {
  const obj = resolveCus(c);
  if (obj) return obj.name;
  if (typeof c === "string") return c.slice(-6).toUpperCase();
  return "—";
}

function stockStatus(stock: number, required: number): "ok" | "low" | "out" {
  if (stock <= 0) return "out";
  if (stock < required) return "ok";
  return "ok";
}

const STOCK_ICON = {
  ok: <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />,
  low: <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />,
  out: <XCircle className="h-4 w-4 text-red-500 shrink-0" />,
};
const STOCK_TEXT = {
  ok: "text-green-600",
  low: "text-yellow-600",
  out: "text-red-600",
};

// Verify keys — now includes stock & deadline checks
const VERIFY_KEYS = ["customer", "quantity", "type", "price"] as const;
type VerifyKey = (typeof VERIFY_KEYS)[number];

type FieldStatus = "match" | "mismatch" | "no_data";

const SAMPLE = [
  {
    id: "ORD-001",
    mat: "กระจกใส 6mm",
    qty: 10,
    stock: 32,
    stations: ["ตัด", "ขัด"],
  },
  { id: "ORD-002", mat: "กระจกฝ้า 4mm", qty: 20, stock: 8, stations: [] },
  { id: "ORD-003", mat: "กระจกดำ 8mm", qty: 8, stock: 0, stations: ["ตัด"] },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function OrderReleasePanel({
  title = "ประเมินออเดอร์ก่อน Release",
  maxItems = 10,
  showStockCheck = true,
}: OrderReleasePanelProps) {
  const {
    connectors: { connect, drag },
    selected,
  } = useNode((s) => ({ selected: s.events.selected }));
  const isPreview = usePreview();
  const { stationName: ctxStationName, setIsOrderReleaseStation } =
    useStationContext();

  useEffect(() => {
    setIsOrderReleaseStation(true);
    return () => setIsOrderReleaseStation(false);
  }, [setIsOrderReleaseStation]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});

  /** Acknowledged fields per order: orderId → Set<VerifyKey> — only needed for mismatches */
  const [acknowledged, setAcknowledged] = useState<
    Record<string, Set<VerifyKey>>
  >({});
  /** Extra acknowledges: stock warning, no-bill warning */
  const [stockAcked, setStockAcked] = useState<Set<string>>(new Set());
  const [noBillAcked, setNoBillAcked] = useState<Set<string>>(new Set());
  const [deadlineAcked, setDeadlineAcked] = useState<Set<string>>(new Set());

  const [releasing, setReleasing] = useState<string | null>(null);
  /** Confirmation dialog state */
  const [confirmDialog, setConfirmDialog] = useState<Order | null>(null);

  useEffect(() => {
    load();
  }, [isPreview]);

  useWebSocket("order", ["order:updated"], () => {
    load();
  });
  useWebSocket("inventory", ["inventory:updated", "material:updated"], () => {
    load();
  });
  useWebSocket("station", ["station:updated"], () => {
    load();
  });

  const load = async () => {
    setLoading(true);
    try {
      const [ordRes, invRes, stRes] = await Promise.all([
        ordersApi.getAll(),
        showStockCheck
          ? inventoriesApi.getAll()
          : Promise.resolve({
              success: true,
              data: [] as Inventory[],
              message: "",
            }),
        stationsApi.getAll(),
      ]);

      let list: Order[] = ordRes.success ? ordRes.data : [];
      list = list.filter((o) => o.status === "pending");
      list = list
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        .slice(0, maxItems);

      setOrders(list);
      if (invRes.success) setInventories(invRes.data);
      if (stRes.success) setStations(stRes.data);

      const init: Record<string, string[]> = {};
      list.forEach((o) => {
        const raw = Array.isArray(o.stations) ? o.stations : [];
        init[o._id] = raw.map((s) => getStationId(s));
      });
      setAssignments(init);
    } finally {
      setLoading(false);
    }
  };

  const getStock = (mId: string) =>
    inventories
      .filter((inv) => matId(inv.material) === mId)
      .reduce((sum, inv) => sum + inv.quantity, 0);

  const toggleStation = (ordId: string, stId: string) =>
    setAssignments((prev) => {
      const cur = prev[ordId] ?? [];
      return {
        ...prev,
        [ordId]: cur.includes(stId)
          ? cur.filter((s) => s !== stId)
          : [...cur, stId],
      };
    });

  const toggleAck = (ordId: string, key: VerifyKey) =>
    setAcknowledged((prev) => {
      const cur = new Set(prev[ordId] ?? []);
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      return { ...prev, [ordId]: cur };
    });

  // ── Per-order verification logic ──────────────────────────────────────────
  const getOrderChecks = (order: Order) => {
    const req = resolveReq(order.request);
    const hasBill = !!req;
    const mUnit = matUnit(order.material);

    const billCus = req ? cusName(req.customer) : null;
    const billQty = req?.details?.quantity ?? null;
    const billType = req?.details?.type ?? null;
    const billPrice = req?.details?.estimatedPrice ?? null;
    const billDeadline = req?.deadline ?? null;

    const ordCus = cusName(order.customer);
    const ordQty = order.quantity;
    const ordType = matName(order.material);

    const cusMismatch = billCus != null && billCus !== ordCus;
    const qtyMismatch = billQty != null && billQty !== ordQty;
    const typeMismatch = billType != null && billType !== ordType;

    const fieldStatus = (
      bill: string | null,
      mismatch: boolean,
    ): FieldStatus => {
      if (bill == null) return "no_data";
      return mismatch ? "mismatch" : "match";
    };

    const checks: {
      key: VerifyKey;
      label: string;
      bill: string | null;
      sys: string | null;
      status: FieldStatus;
    }[] = [
      {
        key: "customer",
        label: "ลูกค้า",
        bill: billCus,
        sys: ordCus,
        status: fieldStatus(billCus, cusMismatch),
      },
      {
        key: "quantity",
        label: "จำนวน",
        bill: billQty != null ? `${billQty} ${mUnit}` : null,
        sys: `${ordQty} ${mUnit}`,
        status: fieldStatus(
          billQty != null ? String(billQty) : null,
          qtyMismatch,
        ),
      },
      {
        key: "type",
        label: "ประเภทสินค้า",
        bill: billType,
        sys: ordType,
        status: fieldStatus(billType, typeMismatch),
      },
      {
        key: "price",
        label: "ราคาประมาณ",
        bill: billPrice != null ? `${billPrice.toLocaleString()} ฿` : null,
        sys: null,
        status: billPrice != null ? "match" : "no_data",
      },
    ];

    // Deadline analysis
    let deadlineWarning: "past" | "soon" | null = null;
    if (billDeadline) {
      const dl = new Date(billDeadline);
      const now = new Date();
      const threeDays = new Date(now);
      threeDays.setDate(threeDays.getDate() + 3);
      if (dl < now) deadlineWarning = "past";
      else if (dl <= threeDays) deadlineWarning = "soon";
    }

    return {
      checks,
      hasBill,
      billDeadline,
      deadlineWarning,
      cusMismatch,
      qtyMismatch,
      typeMismatch,
    };
  };

  const canRelease = (order: Order): { ok: boolean; reasons: string[] } => {
    const curSt = assignments[order._id] ?? [];
    const acked = acknowledged[order._id] ?? new Set<VerifyKey>();
    const { checks, hasBill, deadlineWarning } = getOrderChecks(order);

    const reasons: string[] = [];

    // 1. Must select at least one station
    if (curSt.length === 0) {
      reasons.push("ยังไม่ได้เลือกสถานี");
    }

    // 2. All mismatch fields must be acknowledged
    const mismatchFields = checks.filter((c) => c.status === "mismatch");
    const unackedMismatches = mismatchFields.filter((c) => !acked.has(c.key));
    if (unackedMismatches.length > 0) {
      reasons.push(
        `ยังไม่ได้รับทราบข้อมูลไม่ตรง: ${unackedMismatches.map((c) => c.label).join(", ")}`,
      );
    }

    // 3. No-bill warning must be acknowledged
    if (!hasBill && !noBillAcked.has(order._id)) {
      reasons.push("ไม่มีบิลอ้างอิง — ต้องรับทราบก่อน");
    }

    // 4. Stock out must be acknowledged
    const mId = matId(order.material);
    if (showStockCheck) {
      const stock = getStock(mId);
      if (stock <= 0 && !stockAcked.has(order._id)) {
        reasons.push("สต็อกหมด — ต้องรับทราบก่อน");
      }
    }

    // 5. Deadline past must be acknowledged
    if (deadlineWarning === "past" && !deadlineAcked.has(order._id)) {
      reasons.push("เลยกำหนดส่งแล้ว — ต้องรับทราบก่อน");
    }

    return { ok: reasons.length === 0, reasons };
  };

  const releaseOrder = async (order: Order) => {
    setReleasing(order._id);
    setConfirmDialog(null);
    try {
      const stationsToSave = assignments[order._id] ?? [];
      const mat = resolveMat(order.material);
      const mId = matId(order.material);

      // 1. Save station assignment + mark order in_progress
      await ordersApi.update(order._id, {
        ...(stationsToSave.length > 0 && { stations: stationsToSave }),
        status: "in_progress",
      });

      // 2. Routing + first stop (backend stores station ObjectIds)
      const firstStationId =
        stationsToSave.length > 0 ? stationsToSave[0] : null;

      const matchingInv =
        inventories
          .filter((inv) => matId(inv.material) === mId && inv.quantity > 0)
          .sort((a, b) => b.quantity - a.quantity)[0] ?? null;

      // Resolve request ID from order (may be a populated object or string)
      const reqRef = order.request;
      const requestId = reqRef
        ? typeof reqRef === "string"
          ? reqRef
          : (((reqRef as unknown as Record<string, unknown>)?._id as string) ??
            "")
        : "";

      // 3. Update / create panes
      // Strategy: prefer request-based lookup (reliable) → fall back to order-based
      let existingPanes = requestId
        ? await panesApi
            .getAll({ request: requestId, status_ne: "claimed", limit: 100 })
            .catch(() => null)
        : null;
      // If request lookup found nothing, try order filter as secondary check
      if (!existingPanes?.success || (existingPanes.data ?? []).length === 0) {
        existingPanes = await panesApi
          .getAll({ order: order._id, status_ne: "claimed", limit: 100 })
          .catch(() => null);
      }
      const allPanes = existingPanes?.success ? (existingPanes.data ?? []) : [];

      // Only update panes that are unlinked or already belong to this order —
      // don't steal panes that belong to a different order (e.g. during remake release)
      const panes = allPanes.filter((p) => {
        if (!p.order) return true;
        const pOid =
          typeof p.order === "string"
            ? p.order
            : (p.order as unknown as Record<string, string>)?._id;
        return pOid === order._id;
      });

      if (panes.length > 0) {
        await Promise.all(
          panes.map((p) =>
            panesApi.update(p._id, {
              order: order._id,
              ...(requestId && { request: requestId }),
              ...(firstStationId && {
                routing: stationsToSave,
                currentStation: firstStationId,
                currentStatus: "pending",
              }),
              ...(mId && { material: mId }),
              ...(matchingInv && { inventory: matchingInv._id }),
            }),
          ),
        );
      } else if (allPanes.length === 0) {
        const qty = Math.max(1, order.quantity ?? 1);
        const spec = mat?.specDetails;
        const panePayload: Record<string, unknown> = {
          order: order._id,
          ...(requestId && { request: requestId }),
          currentStation: firstStationId ?? undefined,
          currentStatus: "pending",
          routing: stationsToSave.length > 0 ? stationsToSave : undefined,
          dimensions: {
            width: Number(spec?.width) || 0,
            height: Number(spec?.length) || 0,
            thickness: Number(spec?.thickness) || 0,
          },
          glassType: mId || undefined,
          glassTypeLabel: matName(order.material) || undefined,
          ...(mId && { material: mId }),
          ...(matchingInv && { inventory: matchingInv._id }),
        };
        await Promise.all(
          Array.from({ length: qty }, () =>
            panesApi.create({ ...panePayload } as Partial<
              import("@/lib/api/types").Pane
            >),
          ),
        );
      }

      // 4. Try release endpoint
      await ordersApi.release(order._id).catch(() => null);
      await load();
    } finally {
      setReleasing(null);
    }
  };

  // ── Confirmation dialog summary builder ──────────────────────────────────
  const buildSummary = (order: Order) => {
    const { checks, hasBill, billDeadline, deadlineWarning } =
      getOrderChecks(order);
    const curSt = assignments[order._id] ?? [];
    const stationMap = new Map(stations.map((s) => [s._id, s.name]));
    const mId = matId(order.material);
    const stock = showStockCheck ? getStock(mId) : -1;
    const st = showStockCheck ? stockStatus(stock, order.quantity) : "ok";

    const warnings: string[] = [];
    checks
      .filter((c) => c.status === "mismatch")
      .forEach((c) => {
        warnings.push(`${c.label}: บิล "${c.bill}" ≠ ระบบ "${c.sys}"`);
      });
    if (!hasBill) warnings.push("ไม่มีบิลอ้างอิง");
    if (showStockCheck && stock <= 0) warnings.push("สต็อกหมด");
    else if (showStockCheck && st === "low")
      warnings.push(`สต็อกไม่พอ (มี ${stock}, ต้องการ ${order.quantity})`);
    if (deadlineWarning === "past")
      warnings.push(
        `เลยกำหนดส่ง (${new Date(billDeadline!).toLocaleDateString("th-TH")})`,
      );
    else if (deadlineWarning === "soon")
      warnings.push(
        `ใกล้กำหนดส่ง (${new Date(billDeadline!).toLocaleDateString("th-TH")})`,
      );

    return {
      customer: cusName(order.customer),
      material: matName(order.material),
      quantity: order.quantity,
      unit: matUnit(order.material),
      stationNames: curSt.map((id) => stationMap.get(id) ?? id),
      warnings,
    };
  };

  // ── Design mode ────────────────────────────────────────────────────────────
  if (!isPreview) {
    const designItems = orders.length > 0 ? orders : null;
    return (
      <div
        ref={(ref) => {
          ref && connect(drag(ref));
        }}
        className={`w-full rounded-xl border-2 cursor-grab transition-all overflow-hidden
                    ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`}
      >
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border/50">
          <ClipboardList className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-semibold">{title}</span>
          {loading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />
          )}
          <span
            className={`${loading ? "" : "ml-auto"} text-[10px] px-2 py-0.5 rounded-full bg-muted border text-muted-foreground`}
          >
            {designItems ? `${designItems.length} รายการ` : "รอ/กำลังดำเนินการ"}
          </span>
        </div>
        <div className="divide-y divide-border/30">
          {designItems
            ? designItems.map((order) => {
                const mId = matId(order.material);
                const mName = matName(order.material);
                const stock = showStockCheck ? getStock(mId) : -1;
                const s = showStockCheck
                  ? stockStatus(stock, order.quantity)
                  : "ok";
                const curSt = assignments[order._id] ?? [];
                return (
                  <div
                    key={order._id}
                    className="px-4 py-3 flex items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-mono text-muted-foreground">
                          {order.code ?? order._id.slice(-6)}
                        </span>
                        {showStockCheck && STOCK_ICON[s]}
                      </div>
                      <p className="text-xs text-foreground/70 truncate">
                        {mName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        ต้องการ {order.quantity} {matUnit(order.material)}
                        {showStockCheck && stock >= 0 && (
                          <>
                            {" "}
                            | สต็อก{" "}
                            <span className={STOCK_TEXT[s]}>{stock}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end max-w-[120px]">
                      {curSt.length > 0 ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 font-medium">
                          {curSt.length} สถานี
                        </span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/50 italic">
                          ยังไม่กำหนด
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            : SAMPLE.map((row) => {
                const s =
                  row.stock >= row.qty ? "ok" : row.stock > 0 ? "low" : "out";
                return (
                  <div
                    key={row.id}
                    className="px-4 py-3 flex items-center gap-3 opacity-60"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-mono text-muted-foreground">
                          {row.id}
                        </span>
                        {STOCK_ICON[s]}
                      </div>
                      <p className="text-xs text-foreground/70 truncate">
                        {row.mat}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        ต้องการ {row.qty} | สต็อก{" "}
                        <span className={STOCK_TEXT[s]}>{row.stock}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    );
  }

  // ── Preview / Live mode ────────────────────────────────────────────────────
  return (
    <>
      {/* ── Confirmation Dialog ── */}
      {confirmDialog &&
        (() => {
          const summary = buildSummary(confirmDialog);
          return (
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
              onClick={() => setConfirmDialog(null)}
            >
              <div
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-w-md w-full p-6 space-y-5"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <Rocket className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      ยืนยันปล่อยงาน
                    </h3>
                    <p className="text-xs text-slate-500">
                      ตรวจสอบข้อมูลก่อนกดยืนยัน
                    </p>
                  </div>
                </div>

                {/* Summary info */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                  <div className="px-4 py-2.5 flex justify-between text-sm">
                    <span className="text-slate-500">ลูกค้า</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {summary.customer}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex justify-between text-sm">
                    <span className="text-slate-500">วัสดุ</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {summary.material}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 flex justify-between text-sm">
                    <span className="text-slate-500">จำนวน</span>
                    <span className="font-medium text-slate-900 dark:text-white">
                      {summary.quantity} {summary.unit}
                    </span>
                  </div>
                  <div className="px-4 py-2.5 text-sm">
                    <span className="text-slate-500">
                      สถานี ({summary.stationNames.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {summary.stationNames.map((name, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-xs font-medium"
                        >
                          <span className="text-[10px] text-violet-400">
                            {i + 1}.
                          </span>{" "}
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Warnings */}
                {summary.warnings.length > 0 && (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span className="text-xs font-semibold">
                        คำเตือนที่รับทราบแล้ว
                      </span>
                    </div>
                    {summary.warnings.map((w, i) => (
                      <p
                        key={i}
                        className="text-xs text-amber-700 dark:text-amber-400 pl-5"
                      >
                        • {w}
                      </p>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmDialog(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={() => releaseOrder(confirmDialog)}
                    disabled={releasing === confirmDialog._id}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                  >
                    {releasing === confirmDialog._id ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />{" "}
                        กำลังปล่อย...
                      </>
                    ) : (
                      <>
                        <Rocket className="h-4 w-4" /> ยืนยันปล่อยงาน
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      <div className="w-full rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-card shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/20 border-b">
          <ClipboardList className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-semibold">{title}</span>
          <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {orders.length} รายการ
          </span>
          <button
            onClick={load}
            disabled={loading}
            className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
            title="รีเฟรช"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 rounded-lg bg-muted/30 animate-pulse"
              />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              ไม่มีออเดอร์ที่รอดำเนินการ
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {orders.map((order) => {
              const mId = matId(order.material);
              const mName = matName(order.material);
              const mSpec = matSpecs(order.material);
              const mUnit = matUnit(order.material);
              const stock = showStockCheck ? getStock(mId) : -1;
              const st = showStockCheck
                ? stockStatus(stock, order.quantity)
                : "ok";
              const isOpen = expanded === order._id;
              const curSt = assignments[order._id] ?? [];
              const acked = acknowledged[order._id] ?? new Set<VerifyKey>();

              const {
                checks,
                hasBill,
                billDeadline,
                deadlineWarning,
                cusMismatch,
                qtyMismatch,
                typeMismatch,
              } = getOrderChecks(order);
              const hasMismatch = cusMismatch || qtyMismatch || typeMismatch;

              // Count issues for the badge
              const mismatchCount = checks.filter(
                (c) => c.status === "mismatch",
              ).length;
              const issueCount =
                mismatchCount +
                (!hasBill ? 1 : 0) +
                (showStockCheck && stock <= 0 ? 1 : 0) +
                (deadlineWarning === "past" ? 1 : 0);

              const { ok: isReleasable, reasons } = canRelease(order);

              return (
                <div key={order._id}>
                  {/* Summary row */}
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/20 text-left transition-colors"
                    onClick={() => setExpanded(isOpen ? null : order._id)}
                  >
                    <span className="shrink-0 w-6 h-6 rounded-full bg-muted text-[11px] font-bold flex items-center justify-center text-muted-foreground">
                      {order.priority ?? "-"}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">
                          {mName}
                        </span>
                        {mSpec && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            ({mSpec})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {cusName(order.customer)} · {order.quantity} {mUnit}
                        </span>
                        {showStockCheck && stock >= 0 && (
                          <span
                            className={`text-[11px] font-medium ${STOCK_TEXT[st]}`}
                          >
                            • สต็อก {stock}
                          </span>
                        )}
                      </div>
                    </div>

                    {showStockCheck && STOCK_ICON[st]}

                    {/* Issue count badge */}
                    {issueCount > 0 && (
                      <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] font-semibold">
                        <AlertTriangle className="h-3 w-3" />
                        {issueCount} ปัญหา
                      </span>
                    )}

                    <span
                      className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                        curSt.length > 0
                          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {curSt.length > 0
                        ? `${curSt.length} สถานี`
                        : "ยังไม่กำหนด"}
                    </span>

                    {isOpen ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {/* Expanded panel */}
                  {isOpen && (
                    <div className="px-4 pb-4 pt-3 border-t border-border/30 bg-muted/10 space-y-4">
                      {/* ── Section 1: Bill verification ── */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
                          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                            ตรวจสอบบิล
                          </span>
                          {!hasBill && (
                            <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />{" "}
                              ไม่พบข้อมูลใบสั่ง
                            </span>
                          )}
                          {hasBill && billDeadline && (
                            <span
                              className={`ml-auto text-[10px] flex items-center gap-1 ${
                                deadlineWarning === "past"
                                  ? "text-red-600 dark:text-red-400 font-semibold"
                                  : deadlineWarning === "soon"
                                    ? "text-amber-600 dark:text-amber-400 font-semibold"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {deadlineWarning && <Clock className="h-3 w-3" />}
                              {deadlineWarning === "past"
                                ? "เลยกำหนดส่ง! "
                                : deadlineWarning === "soon"
                                  ? "ใกล้กำหนดส่ง "
                                  : "กำหนดส่ง: "}
                              {new Date(billDeadline).toLocaleDateString(
                                "th-TH",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "2-digit",
                                },
                              )}
                            </span>
                          )}
                        </div>

                        {/* ── No-bill warning box ── */}
                        {!hasBill && (
                          <div
                            className={`rounded-xl border p-3 mb-3 ${
                              noBillAcked.has(order._id)
                                ? "border-amber-300/50 dark:border-amber-800/30 bg-amber-50/30 dark:bg-amber-950/10"
                                : "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <AlertOctagon className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                                  ออเดอร์นี้ไม่มีบิล/ใบสั่งอ้างอิง
                                </p>
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                                  ไม่สามารถเปรียบเทียบข้อมูลกับใบสั่งได้
                                </p>
                              </div>
                              {!noBillAcked.has(order._id) ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setNoBillAcked(
                                      (prev) => new Set([...prev, order._id]),
                                    )
                                  }
                                  className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-[11px] font-semibold hover:bg-amber-700 transition-colors"
                                >
                                  รับทราบ
                                </button>
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0" />
                              )}
                            </div>
                          </div>
                        )}

                        {/* ── Deadline past warning ── */}
                        {deadlineWarning === "past" && (
                          <div
                            className={`rounded-xl border p-3 mb-3 ${
                              deadlineAcked.has(order._id)
                                ? "border-red-300/50 dark:border-red-800/30 bg-red-50/30 dark:bg-red-950/10"
                                : "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <Clock className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-red-800 dark:text-red-300">
                                  เลยกำหนดส่งแล้ว (
                                  {new Date(billDeadline!).toLocaleDateString(
                                    "th-TH",
                                  )}
                                  )
                                </p>
                                <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5">
                                  ออเดอร์นี้เลยกำหนดส่ง ต้องรับทราบก่อนปล่อยงาน
                                </p>
                              </div>
                              {!deadlineAcked.has(order._id) ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeadlineAcked(
                                      (prev) => new Set([...prev, order._id]),
                                    )
                                  }
                                  className="shrink-0 px-3 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700 transition-colors"
                                >
                                  รับทราบ
                                </button>
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-red-500 shrink-0" />
                              )}
                            </div>
                          </div>
                        )}

                        {/* ── Stock warning ── */}
                        {showStockCheck && stock <= 0 && (
                          <div
                            className={`rounded-xl border p-3 mb-3 ${
                              stockAcked.has(order._id)
                                ? "border-red-300/50 dark:border-red-800/30 bg-red-50/30 dark:bg-red-950/10"
                                : "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-red-800 dark:text-red-300">
                                  สต็อกวัสดุหมด
                                </p>
                                <p className="text-[11px] text-red-700 dark:text-red-400 mt-0.5">
                                  {matName(order.material)} — ต้องการ{" "}
                                  {order.quantity} {mUnit} แต่สต็อกเป็น 0
                                </p>
                              </div>
                              {!stockAcked.has(order._id) ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setStockAcked(
                                      (prev) => new Set([...prev, order._id]),
                                    )
                                  }
                                  className="shrink-0 px-3 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-semibold hover:bg-red-700 transition-colors"
                                >
                                  รับทราบ
                                </button>
                              ) : (
                                <CheckCircle2 className="h-4 w-4 text-red-500 shrink-0" />
                              )}
                            </div>
                          </div>
                        )}

                        {/* ── Field comparison table ── */}
                        <div className="rounded-xl border border-border/60 overflow-hidden">
                          {/* Column headers */}
                          <div className="grid grid-cols-[4rem_1fr_1fr_2.5rem] items-center gap-2 px-3 py-1.5 bg-muted/40 border-b border-border/40">
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              รายการ
                            </span>
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              จากบิล / ใบสั่ง
                            </span>
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              ในระบบ
                            </span>
                            <span className="text-[10px] font-semibold text-muted-foreground text-center">
                              สถานะ
                            </span>
                          </div>

                          {checks.map(({ key, label, bill, sys, status }) => {
                            const isMatch = status === "match";
                            const isMismatch = status === "mismatch";
                            const isAcked = acked.has(key);

                            return (
                              <div
                                key={key}
                                className={`grid grid-cols-[4rem_1fr_1fr_2.5rem] items-center gap-2 px-3 py-2.5 border-b border-border/30 last:border-0 ${
                                  isMatch
                                    ? "bg-emerald-50/40 dark:bg-emerald-950/10"
                                    : isMismatch && !isAcked
                                      ? "bg-red-50/60 dark:bg-red-950/15"
                                      : isMismatch && isAcked
                                        ? "bg-amber-50/40 dark:bg-amber-950/10"
                                        : ""
                                }`}
                              >
                                {/* Field label */}
                                <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 truncate">
                                  {label}
                                </span>

                                {/* Bill value */}
                                <span
                                  className={`text-xs truncate ${bill == null ? "text-muted-foreground/40 italic" : "text-foreground"}`}
                                >
                                  {bill ?? "ไม่มีข้อมูล"}
                                </span>

                                {/* System value */}
                                <span
                                  className={`text-xs truncate ${
                                    sys == null
                                      ? "text-muted-foreground/30"
                                      : isMismatch
                                        ? "text-red-600 dark:text-red-400 font-semibold"
                                        : "text-foreground"
                                  }`}
                                >
                                  {sys ?? "—"}
                                </span>

                                {/* Status indicator */}
                                <div className="flex justify-center">
                                  {isMatch && (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                  )}
                                  {isMismatch && !isAcked && (
                                    <button
                                      type="button"
                                      onClick={() => toggleAck(order._id, key)}
                                      title="กดเพื่อรับทราบว่าข้อมูลไม่ตรง"
                                      className="h-5 w-5 rounded-md border-2 border-red-400 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                    ></button>
                                  )}
                                  {isMismatch && isAcked && (
                                    <button
                                      type="button"
                                      onClick={() => toggleAck(order._id, key)}
                                      className="h-5 w-5 rounded-md bg-amber-500 border-2 border-amber-500 flex items-center justify-center"
                                      title="รับทราบแล้ว — กดเพื่อยกเลิก"
                                    >
                                      <svg
                                        className="h-3 w-3 text-white"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={3}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M5 13l4 4L19 7"
                                        />
                                      </svg>
                                    </button>
                                  )}
                                  {status === "no_data" &&
                                    bill == null &&
                                    sys != null && (
                                      <span className="text-[10px] text-muted-foreground/40">
                                        —
                                      </span>
                                    )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Auto-confirm matching shortcut — only for matched items */}
                        {hasBill &&
                          checks.some(
                            (c) => c.status === "mismatch" && !acked.has(c.key),
                          ) && (
                            <p className="mt-2 text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              กดช่องว่างสีแดงเพื่อรับทราบรายการที่ข้อมูลไม่ตรง (
                              {
                                checks.filter(
                                  (c) =>
                                    c.status === "mismatch" &&
                                    !acked.has(c.key),
                                ).length
                              }{" "}
                              รายการ)
                            </p>
                          )}
                      </div>

                      {/* ── Section 2: Station picker ── */}
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
                          กำหนดสถานีที่ต้องผ่าน
                        </p>
                        {stations.length === 0 ? (
                          <p className="text-xs text-muted-foreground/60 italic">
                            ยังไม่มีสถานีในระบบ กรุณาสร้างสถานีก่อน
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {stations.map((s) => {
                              const active = curSt.includes(s._id);
                              return (
                                <button
                                  key={s._id}
                                  type="button"
                                  onClick={() =>
                                    toggleStation(order._id, s._id)
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                    active
                                      ? "bg-violet-600 text-white border-violet-600"
                                      : "bg-background text-foreground border-border hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                                  }`}
                                >
                                  {s.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* ── Release button ── */}
                      <div className="flex items-center gap-2 pt-1">
                        {/* Blocking conditions shown inline */}
                        {!isReleasable && (
                          <div className="flex-1 min-w-0 space-y-0.5">
                            {reasons.slice(0, 2).map((r, i) => (
                              <span
                                key={i}
                                className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium"
                              >
                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                <span className="truncate">{r}</span>
                              </span>
                            ))}
                            {reasons.length > 2 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{reasons.length - 2} รายการ
                              </span>
                            )}
                          </div>
                        )}

                        <div className={isReleasable ? "ml-auto" : ""}>
                          <button
                            type="button"
                            onClick={() => setConfirmDialog(order)}
                            disabled={!isReleasable || releasing === order._id}
                            title={
                              !isReleasable ? reasons.join("\n") : undefined
                            }
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {releasing === order._id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />{" "}
                                กำลังปล่อย...
                              </>
                            ) : (
                              <>
                                <Rocket className="h-3.5 w-3.5" />{" "}
                                ยืนยันและปล่อยงาน
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

OrderReleasePanel.craft = {
  displayName: "Order Release Panel",
  props: {
    title: "ประเมินออเดอร์ก่อน Release",
    maxItems: 10,
    showStockCheck: true,
  } as OrderReleasePanelProps,
};
