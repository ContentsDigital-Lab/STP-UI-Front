"use client";

import { useNode } from "@craftjs/core";
import { useEffect, useState } from "react";
import {
    ClipboardList, Package, CheckCircle2, AlertTriangle, XCircle,
    ChevronDown, ChevronUp, RefreshCw, Rocket, Loader2, ShieldCheck,
} from "lucide-react";
import { QrCodeModal } from "@/components/qr/QrCodeModal";
import { usePreview } from "../PreviewContext";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { inventoriesApi } from "@/lib/api/inventories";
import { ordersApi }       from "@/lib/api/orders";
import { panesApi }        from "@/lib/api/panes";
import { stationsApi }     from "@/lib/api/stations";
import { Order, Inventory, Material, Station, OrderRequest, Customer } from "@/lib/api/types";

interface OrderReleasePanelProps {
    title?:          string;
    maxItems?:       number;
    showStockCheck?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolveMat(m: unknown): Material | null {
    if (!m || typeof m === "string") return null;
    return m as Material;
}
function matId(m: unknown)    { return resolveMat(m)?._id   ?? (typeof m === "string" ? m : ""); }
function matName(m: unknown)  { return resolveMat(m)?.name  ?? (typeof m === "string" ? m : "-"); }
function matUnit(m: unknown)  { return resolveMat(m)?.unit  ?? "ชิ้น"; }
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
    if (stock < required) return "low";
    return "ok";
}

const STOCK_ICON = {
    ok:  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />,
    low: <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />,
    out: <XCircle       className="h-4 w-4 text-red-500 shrink-0" />,
};
const STOCK_TEXT = { ok: "text-green-600", low: "text-yellow-600", out: "text-red-600" };

// The 4 fields a worker must confirm before releasing
const CONFIRM_KEYS = ["customer", "quantity", "type", "price"] as const;
type ConfirmKey = typeof CONFIRM_KEYS[number];

const SAMPLE = [
    { id: "ORD-001", mat: "กระจกใส 6mm",  qty: 10, stock: 32, stations: ["ตัด", "ขัด"] },
    { id: "ORD-002", mat: "กระจกฝ้า 4mm", qty: 20, stock:  8, stations: []            },
    { id: "ORD-003", mat: "กระจกดำ 8mm",  qty:  8, stock:  0, stations: ["ตัด"]       },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function OrderReleasePanel({
    title          = "ประเมินออเดอร์ก่อน Release",
    maxItems       = 10,
    showStockCheck = true,
}: OrderReleasePanelProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();

    const [orders,        setOrders]        = useState<Order[]>([]);
    const [inventories,   setInventories]   = useState<Inventory[]>([]);
    const [stations,      setStations]      = useState<Station[]>([]);
    const [loading,       setLoading]       = useState(false);
    const [expanded,      setExpanded]      = useState<string | null>(null);
    const [assignments,   setAssignments]   = useState<Record<string, string[]>>({});
    /** Which confirm checkboxes are ticked per order: orderId → Set<ConfirmKey> */
    const [confirmations, setConfirmations] = useState<Record<string, Set<ConfirmKey>>>({});
    const [releasing,     setReleasing]     = useState<string | null>(null);
    const [qrTarget,      setQrTarget]      = useState<{ code: string; label: string; url: string } | null>(null);

    useEffect(() => { load(); }, [isPreview]);

    useWebSocket("order",     ["order:updated"],                         () => { load(); });
    useWebSocket("inventory", ["inventory:updated", "material:updated"], () => { load(); });
    useWebSocket("station",   ["station:updated"],                       () => { load(); });

    const load = async () => {
        setLoading(true);
        try {
            const [ordRes, invRes, stRes] = await Promise.all([
                ordersApi.getAll(),
                showStockCheck
                    ? inventoriesApi.getAll()
                    : Promise.resolve({ success: true, data: [] as Inventory[], message: "" }),
                stationsApi.getAll(),
            ]);

            let list: Order[] = ordRes.success ? ordRes.data : [];
            list = list.filter(o => o.status === "pending");
            list = list.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, maxItems);

            setOrders(list);
            if (invRes.success) setInventories(invRes.data);
            if (stRes.success)  setStations(stRes.data);

            const init: Record<string, string[]> = {};
            list.forEach(o => { init[o._id] = Array.isArray(o.stations) ? o.stations : []; });
            setAssignments(init);
        } finally {
            setLoading(false);
        }
    };

    const getStock = (mId: string) =>
        inventories
            .filter(inv => matId(inv.material) === mId)
            .reduce((sum, inv) => sum + inv.quantity, 0);

    const toggleStation = (ordId: string, stId: string) =>
        setAssignments(prev => {
            const cur = prev[ordId] ?? [];
            return { ...prev, [ordId]: cur.includes(stId) ? cur.filter(s => s !== stId) : [...cur, stId] };
        });

    const toggleConfirm = (ordId: string, key: ConfirmKey) =>
        setConfirmations(prev => {
            const cur = new Set(prev[ordId] ?? []);
            if (cur.has(key)) cur.delete(key); else cur.add(key);
            return { ...prev, [ordId]: cur };
        });

    const allConfirmed = (ordId: string) =>
        CONFIRM_KEYS.every(k => confirmations[ordId]?.has(k));

    const releaseOrder = async (order: Order) => {
        setReleasing(order._id);
        try {
            const stationsToSave = assignments[order._id] ?? [];
            const mat = resolveMat(order.material);
            const mId = matId(order.material);

            // 1. Save station assignment + mark order in_progress
            await ordersApi.update(order._id, {
                ...(stationsToSave.length > 0 && { stations: stationsToSave }),
                status: "in_progress",
            });

            // 2. Build routing names
            const stationMap   = new Map(stations.map(s => [s._id, s.name]));
            const routingNames = stationsToSave.map(id => stationMap.get(id) ?? id);
            const firstStation = routingNames.length > 0 ? routingNames[0] : null;

            const matchingInv = inventories
                .filter(inv => matId(inv.material) === mId && inv.quantity > 0)
                .sort((a, b) => b.quantity - a.quantity)[0] ?? null;

            // 3. Update / create panes — independent of release endpoint
            const existingPanes = await panesApi.getAll({ order: order._id, limit: 100 }).catch(() => null);
            const panes = existingPanes?.success ? (existingPanes.data ?? []) : [];

            if (panes.length > 0) {
                if (firstStation) {
                    await Promise.all(
                        panes.map(p => panesApi.update(p._id, {
                            routing: routingNames,
                            currentStation: firstStation,
                            currentStatus: "pending",
                            ...(mId         && { material:  mId }),
                            ...(matchingInv && { inventory: matchingInv._id }),
                        }))
                    );
                }
            } else {
                const qty  = Math.max(1, order.quantity ?? 1);
                const spec = mat?.specDetails;
                const panePayload = {
                    order: order._id,
                    currentStation: firstStation ?? "order_release",
                    currentStatus: "pending" as const,
                    routing: routingNames.length > 0 ? routingNames : undefined,
                    dimensions: {
                        width:     spec?.width     ? parseFloat(spec.width)     || 0 : 0,
                        height:    spec?.length    ? parseFloat(spec.length)    || 0 : 0,
                        thickness: spec?.thickness ? parseFloat(spec.thickness) || 0 : 0,
                    },
                    glassType:      mId || undefined,
                    glassTypeLabel: matName(order.material) || undefined,
                    ...(mId         && { material:  mId }),
                    ...(matchingInv && { inventory: matchingInv._id }),
                };
                await Promise.all(
                    Array.from({ length: qty }, () => panesApi.create({ ...panePayload }))
                );
            }

            // 4. Try release endpoint for QR code — fallback to orderNumber if unavailable
            const releaseRes = await ordersApi.release(order._id).catch(() => null);
            const qrCode = releaseRes?.data?.code ?? order.orderNumber ?? order._id.slice(-6).toUpperCase();

            const cName = cusName(order.customer);
            setQrTarget({
                code:  qrCode,
                label: [mat?.name ?? "", cName].filter(Boolean).join(" — "),
                url:   `${window.location.origin}/production/${order._id}`,
            });
            await load();
        } finally {
            setReleasing(null);
        }
    };

    // ── Design mode ────────────────────────────────────────────────────────────
    if (!isPreview) {
        const designItems = orders.length > 0 ? orders : null;
        return (
            <div
                ref={(ref) => { ref && connect(drag(ref)); }}
                className={`w-full rounded-xl border-2 cursor-grab transition-all overflow-hidden
                    ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`}
            >
                <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border/50">
                    <ClipboardList className="h-4 w-4 text-violet-600" />
                    <span className="text-sm font-semibold">{title}</span>
                    {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-auto" />}
                    <span className={`${loading ? "" : "ml-auto"} text-[10px] px-2 py-0.5 rounded-full bg-muted border text-muted-foreground`}>
                        {designItems ? `${designItems.length} รายการ` : "รอ/กำลังดำเนินการ"}
                    </span>
                </div>
                <div className="divide-y divide-border/30">
                    {designItems ? designItems.map(order => {
                        const mId    = matId(order.material);
                        const mName  = matName(order.material);
                        const stock  = showStockCheck ? getStock(mId) : -1;
                        const s      = showStockCheck ? stockStatus(stock, order.quantity) : "ok";
                        const curSt  = assignments[order._id] ?? [];
                        return (
                            <div key={order._id} className="px-4 py-3 flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-xs font-mono text-muted-foreground">{order.code ?? order._id.slice(-6)}</span>
                                        {showStockCheck && STOCK_ICON[s]}
                                    </div>
                                    <p className="text-xs text-foreground/70 truncate">{mName}</p>
                                    <p className="text-[11px] text-muted-foreground">
                                        ต้องการ {order.quantity} {matUnit(order.material)}
                                        {showStockCheck && stock >= 0 && <> | สต็อก <span className={STOCK_TEXT[s]}>{stock}</span></>}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-1 justify-end max-w-[120px]">
                                    {curSt.length > 0
                                        ? <span className="px-1.5 py-0.5 rounded text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 font-medium">{curSt.length} สถานี</span>
                                        : <span className="text-[10px] text-muted-foreground/50 italic">ยังไม่กำหนด</span>
                                    }
                                </div>
                            </div>
                        );
                    }) : SAMPLE.map(row => {
                        const s = row.stock >= row.qty ? "ok" : row.stock > 0 ? "low" : "out";
                        return (
                            <div key={row.id} className="px-4 py-3 flex items-center gap-3 opacity-60">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="text-xs font-mono text-muted-foreground">{row.id}</span>
                                        {STOCK_ICON[s]}
                                    </div>
                                    <p className="text-xs text-foreground/70 truncate">{row.mat}</p>
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
        {qrTarget && (
            <QrCodeModal
                code={qrTarget.code}
                label={qrTarget.label}
                value={qrTarget.url}
                onClose={() => setQrTarget(null)}
            />
        )}
        <div className="w-full rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-card shadow-sm">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-muted/20 border-b">
                <ClipboardList className="h-4 w-4 text-violet-600" />
                <span className="text-sm font-semibold">{title}</span>
                <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {orders.length} รายการ
                </span>
                <button onClick={load} disabled={loading} className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground" title="รีเฟรช">
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            {/* Body */}
            {loading ? (
                <div className="p-4 space-y-2">
                    {[1,2,3].map(i => <div key={i} className="h-14 rounded-lg bg-muted/30 animate-pulse" />)}
                </div>
            ) : orders.length === 0 ? (
                <div className="p-8 text-center">
                    <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">ไม่มีออเดอร์ที่รอดำเนินการ</p>
                </div>
            ) : (
                <div className="divide-y divide-border/40">
                    {orders.map(order => {
                        const mId    = matId(order.material);
                        const mName  = matName(order.material);
                        const mSpec  = matSpecs(order.material);
                        const mUnit  = matUnit(order.material);
                        const stock  = showStockCheck ? getStock(mId) : -1;
                        const st     = showStockCheck ? stockStatus(stock, order.quantity) : "ok";
                        const isOpen = expanded === order._id;
                        const curSt  = assignments[order._id] ?? [];
                        const confirmed = confirmations[order._id] ?? new Set<ConfirmKey>();
                        const canRelease = allConfirmed(order._id) && curSt.length > 0;

                        // ── Bill data from OrderRequest ────────────────────────
                        const req        = resolveReq(order.request);
                        const billCus    = req ? cusName(req.customer) : null;
                        const billQty    = req?.details?.quantity ?? null;
                        const billType   = req?.details?.type ?? null;
                        const billPrice  = req?.details?.estimatedPrice ?? null;
                        const billDeadline = req?.deadline ?? null;

                        const ordCus    = cusName(order.customer);
                        const ordQty    = order.quantity;
                        const ordType   = mName;

                        // Check fields: null = can't compare (no request data)
                        const cusMismatch    = billCus  != null && billCus  !== ordCus;
                        const qtyMismatch    = billQty  != null && billQty  !== ordQty;
                        const typeMismatch   = billType != null && billType !== ordType;
                        const hasMismatch    = cusMismatch || qtyMismatch || typeMismatch;

                        const checks: { key: ConfirmKey; label: string; bill: string | null; sys: string | null; mismatch: boolean }[] = [
                            { key: "customer", label: "ลูกค้า",        bill: billCus,                         sys: ordCus,        mismatch: cusMismatch  },
                            { key: "quantity", label: "จำนวน",         bill: billQty != null ? `${billQty} ${mUnit}` : null, sys: `${ordQty} ${mUnit}`, mismatch: qtyMismatch  },
                            { key: "type",     label: "ประเภทสินค้า",  bill: billType,                        sys: ordType,       mismatch: typeMismatch },
                            { key: "price",    label: "ราคาประมาณ",   bill: billPrice != null ? `${billPrice.toLocaleString()} ฿` : null, sys: null, mismatch: false },
                        ];

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
                                            <span className="text-xs font-medium truncate">{mName}</span>
                                            {mSpec && <span className="text-[10px] text-muted-foreground shrink-0">({mSpec})</span>}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[11px] text-muted-foreground">
                                                {cusName(order.customer)} · {order.quantity} {mUnit}
                                            </span>
                                            {showStockCheck && stock >= 0 && (
                                                <span className={`text-[11px] font-medium ${STOCK_TEXT[st]}`}>
                                                    • สต็อก {stock}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {showStockCheck && STOCK_ICON[st]}

                                    {/* Mismatch warning badge */}
                                    {hasMismatch && (
                                        <span className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] font-semibold">
                                            <AlertTriangle className="h-3 w-3" /> ข้อมูลไม่ตรง
                                        </span>
                                    )}

                                    <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                        curSt.length > 0
                                            ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                                            : "bg-muted text-muted-foreground"
                                    }`}>
                                        {curSt.length > 0 ? `${curSt.length} สถานี` : "ยังไม่กำหนด"}
                                    </span>

                                    {isOpen
                                        ? <ChevronUp   className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    }
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
                                                {!req && (
                                                    <span className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                                        <AlertTriangle className="h-3 w-3" /> ไม่พบข้อมูลใบสั่ง
                                                    </span>
                                                )}
                                                {req && billDeadline && (
                                                    <span className="ml-auto text-[10px] text-muted-foreground">
                                                        กำหนดส่ง: {new Date(billDeadline).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" })}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="rounded-xl border border-border/60 overflow-hidden">
                                                {/* Column headers */}
                                                <div className="grid grid-cols-[1.5rem_4rem_1fr_1fr_1.5rem] items-center gap-2 px-3 py-1.5 bg-muted/40 border-b border-border/40">
                                                    <div />
                                                    <span className="text-[10px] font-semibold text-muted-foreground">รายการ</span>
                                                    <span className="text-[10px] font-semibold text-muted-foreground">จากบิล / ใบสั่ง</span>
                                                    <span className="text-[10px] font-semibold text-muted-foreground">ในระบบ</span>
                                                    <div />
                                                </div>

                                                {checks.map(({ key, label, bill, sys, mismatch }) => {
                                                    const isChecked = confirmed.has(key);
                                                    return (
                                                        <label
                                                            key={key}
                                                            className={`grid grid-cols-[1.5rem_4rem_1fr_1fr_1.5rem] items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors border-b border-border/30 last:border-0 ${
                                                                isChecked
                                                                    ? "bg-emerald-50/60 dark:bg-emerald-950/10"
                                                                    : mismatch
                                                                        ? "bg-red-50/50 dark:bg-red-950/10"
                                                                        : "hover:bg-muted/20"
                                                            }`}
                                                        >
                                                            {/* Checkbox */}
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => toggleConfirm(order._id, key)}
                                                                className="sr-only"
                                                            />
                                                            <div className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-all shrink-0 ${
                                                                isChecked
                                                                    ? "bg-emerald-500 border-emerald-500"
                                                                    : mismatch
                                                                        ? "border-red-400"
                                                                        : "border-slate-300 dark:border-slate-600"
                                                            }`}>
                                                                {isChecked && (
                                                                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>

                                                            {/* Field label */}
                                                            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 truncate">{label}</span>

                                                            {/* Bill value */}
                                                            <span className={`text-xs truncate ${bill == null ? "text-muted-foreground/40 italic" : "text-foreground"}`}>
                                                                {bill ?? "ไม่มีข้อมูล"}
                                                            </span>

                                                            {/* System value */}
                                                            <span className={`text-xs truncate ${
                                                                sys == null
                                                                    ? "text-muted-foreground/30"
                                                                    : mismatch
                                                                        ? "text-red-600 dark:text-red-400 font-semibold"
                                                                        : "text-foreground"
                                                            }`}>
                                                                {sys ?? "—"}
                                                            </span>

                                                            {/* Match indicator */}
                                                            <div className="flex justify-center">
                                                                {mismatch
                                                                    ? <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                                                    : bill != null && sys != null
                                                                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                                        : null
                                                                }
                                                            </div>
                                                        </label>
                                                    );
                                                })}
                                            </div>

                                            {/* Confirm-all shortcut */}
                                            {!allConfirmed(order._id) && (
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmations(prev => ({
                                                        ...prev,
                                                        [order._id]: new Set(CONFIRM_KEYS),
                                                    }))}
                                                    className="mt-2 text-[11px] text-violet-600 dark:text-violet-400 hover:underline"
                                                >
                                                    ยืนยันทั้งหมดในครั้งเดียว →
                                                </button>
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
                                                    {stations.map(s => {
                                                        const active = curSt.includes(s._id);
                                                        return (
                                                            <button
                                                                key={s._id}
                                                                type="button"
                                                                onClick={() => toggleStation(order._id, s._id)}
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
                                            {!allConfirmed(order._id) && (
                                                <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                                    <AlertTriangle className="h-3.5 w-3.5" />
                                                    ยืนยันบิลให้ครบก่อน ({confirmed.size}/{CONFIRM_KEYS.length})
                                                </span>
                                            )}
                                            {allConfirmed(order._id) && curSt.length === 0 && (
                                                <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                                    <AlertTriangle className="h-3.5 w-3.5" />
                                                    กรุณาเลือกสถานีก่อน
                                                </span>
                                            )}

                                            <div className="ml-auto">
                                                <button
                                                    type="button"
                                                    onClick={() => releaseOrder(order)}
                                                    disabled={!canRelease || releasing === order._id}
                                                    title={!canRelease ? "ต้องยืนยันบิลให้ครบและเลือกสถานีก่อน" : undefined}
                                                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                >
                                                    {releasing === order._id
                                                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> กำลังปล่อย...</>
                                                        : <><Rocket className="h-3.5 w-3.5" /> ยืนยันและปล่อยงาน</>
                                                    }
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
        title:          "ประเมินออเดอร์ก่อน Release",
        maxItems:       10,
        showStockCheck: true,
    } as OrderReleasePanelProps,
};
