"use client";

import { useNode } from "@craftjs/core";
import { useEffect, useState } from "react";
import {
    ClipboardList, Package, CheckCircle2, AlertTriangle, XCircle,
    ChevronDown, ChevronUp, RefreshCw, Save,
} from "lucide-react";
import { usePreview } from "../PreviewContext";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { inventoriesApi } from "@/lib/api/inventories";
import { ordersApi }       from "@/lib/api/orders";
import { stationsApi }     from "@/lib/api/stations";
import { Order, Inventory, Material, Station } from "@/lib/api/types";

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

    const [orders,      setOrders]      = useState<Order[]>([]);
    const [inventories, setInventories] = useState<Inventory[]>([]);
    const [stations,    setStations]    = useState<Station[]>([]);
    const [loading,     setLoading]     = useState(false);
    const [expanded,    setExpanded]    = useState<string | null>(null);
    const [assignments, setAssignments] = useState<Record<string, string[]>>({});
    const [saving,      setSaving]      = useState<string | null>(null);
    const [savedId,     setSavedId]     = useState<string | null>(null);

    useEffect(() => { if (isPreview) load(); }, [isPreview]);

    // Real-time updates via WebSocket
    useWebSocket("order",     ["order:updated"],                              () => { if (isPreview) load(); });
    useWebSocket("inventory", ["inventory:updated", "material:updated"],      () => { if (isPreview) load(); });
    useWebSocket("station",   ["station:updated", "station-template:updated"],() => { if (isPreview) load(); });

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
            list = list.filter(o => o.status !== "completed" && o.status !== "cancelled");
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

    // Sum all inventory for a given material ID
    const getStock = (mId: string) =>
        inventories
            .filter(inv => matId(inv.material) === mId)
            .reduce((sum, inv) => sum + inv.quantity, 0);

    const toggleStation = (ordId: string, stId: string) =>
        setAssignments(prev => {
            const cur = prev[ordId] ?? [];
            return { ...prev, [ordId]: cur.includes(stId) ? cur.filter(s => s !== stId) : [...cur, stId] };
        });

    const saveAssignment = async (ordId: string) => {
        setSaving(ordId);
        try {
            await ordersApi.update(ordId, { stations: assignments[ordId] });
            setSavedId(ordId);
            setTimeout(() => setSavedId(null), 2500);
        } finally {
            setSaving(null);
        }
    };

    // ── Design mode ────────────────────────────────────────────────────────────
    if (!isPreview) {
        return (
            <div
                ref={(ref) => { ref && connect(drag(ref)); }}
                className={`w-full rounded-xl border-2 cursor-grab transition-all overflow-hidden
                    ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`}
            >
                <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border/50">
                    <ClipboardList className="h-4 w-4 text-violet-600" />
                    <span className="text-sm font-semibold">{title}</span>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-muted border text-muted-foreground">
                        รอ/กำลังดำเนินการ
                    </span>
                </div>
                <div className="divide-y divide-border/30">
                    {SAMPLE.map(row => {
                        const s = row.stock >= row.qty ? "ok" : row.stock > 0 ? "low" : "out";
                        return (
                            <div key={row.id} className="px-4 py-3 flex items-center gap-3">
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
                                <div className="flex flex-wrap gap-1 justify-end max-w-[120px]">
                                    {row.stations.length > 0
                                        ? row.stations.map(st => (
                                            <span key={st} className="px-1.5 py-0.5 rounded text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 font-medium">{st}</span>
                                        ))
                                        : <span className="text-[10px] text-muted-foreground/50 italic">ยังไม่กำหนด</span>
                                    }
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

                        return (
                            <div key={order._id}>
                                {/* Summary row */}
                                <button
                                    type="button"
                                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/20 text-left transition-colors"
                                    onClick={() => setExpanded(isOpen ? null : order._id)}
                                >
                                    {/* Priority */}
                                    <span className="shrink-0 w-6 h-6 rounded-full bg-muted text-[11px] font-bold flex items-center justify-center text-muted-foreground">
                                        {order.priority ?? "-"}
                                    </span>

                                    {/* Material info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-medium truncate">{mName}</span>
                                            {mSpec && <span className="text-[10px] text-muted-foreground shrink-0">({mSpec})</span>}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[11px] text-muted-foreground">
                                                ต้องการ {order.quantity} {mUnit}
                                            </span>
                                            {showStockCheck && stock >= 0 && (
                                                <span className={`text-[11px] font-medium ${STOCK_TEXT[st]}`}>
                                                    • สต็อก {stock}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Stock icon */}
                                    {showStockCheck && STOCK_ICON[st]}

                                    {/* Station count badge */}
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

                                {/* Expanded: station picker */}
                                {isOpen && (
                                    <div className="px-4 pb-4 pt-3 border-t border-border/30 bg-muted/10">
                                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
                                            กำหนดสถานีที่ต้องผ่าน
                                        </p>
                                        {stations.length === 0 ? (
                                            <p className="text-xs text-muted-foreground/60 italic">
                                                ยังไม่มีสถานีในระบบ กรุณาสร้างสถานีก่อน
                                            </p>
                                        ) : (
                                            <div className="flex flex-wrap gap-2">
                                                {stations.map(st => {
                                                    const active = curSt.includes(st._id);
                                                    return (
                                                        <button
                                                            key={st._id}
                                                            type="button"
                                                            onClick={() => toggleStation(order._id, st._id)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                                                active
                                                                    ? "bg-violet-600 text-white border-violet-600"
                                                                    : "bg-background text-foreground border-border hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                                                            }`}
                                                        >
                                                            {st.name}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between mt-3">
                                            {savedId === order._id && (
                                                <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> บันทึกแล้ว
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => saveAssignment(order._id)}
                                                disabled={saving === order._id}
                                                className="ml-auto flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-60 transition-colors"
                                            >
                                                <Save className="h-3 w-3" />
                                                {saving === order._id ? "กำลังบันทึก..." : "บันทึกสถานี"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
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
