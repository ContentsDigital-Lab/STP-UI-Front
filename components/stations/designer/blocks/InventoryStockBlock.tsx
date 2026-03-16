"use client";

import { useNode } from "@craftjs/core";
import { useEffect, useState } from "react";
import { Boxes, Search, CheckCircle2, AlertTriangle, XCircle, RefreshCw, Package } from "lucide-react";
import { usePreview } from "../PreviewContext";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { inventoriesApi } from "@/lib/api/inventories";
import { Inventory, Material } from "@/lib/api/types";

interface InventoryStockBlockProps {
    title?:       string;
    maxItems?:    number;
    stockFilter?: "all" | "low" | "out";
    showSearch?:  boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getMat(m: string | Material | undefined | null): Material | null {
    if (!m || typeof m === "string") return null;
    return m;
}
function getName(m: string | Material | undefined | null): string {
    const mat = getMat(m);
    return mat?.name ?? (typeof m === "string" ? m : "-");
}
function getSpecs(m: string | Material | undefined | null): string {
    const mat = getMat(m);
    if (!mat) return "";
    const s = mat.specDetails;
    return [s.glassType, s.thickness, s.color].filter(Boolean).join(" • ");
}

function stockLevel(qty: number, reorder: number): "ok" | "low" | "out" {
    if (qty <= 0) return "out";
    if (reorder > 0 && qty < reorder) return "low";
    return "ok";
}

const STATUS_ICON = {
    ok:  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />,
    low: <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0 mt-0.5" />,
    out: <XCircle       className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />,
};
const STATUS_TEXT = { ok: "text-green-600", low: "text-yellow-600", out: "text-red-600" };
const STATUS_BAR  = { ok: "bg-green-500",  low: "bg-yellow-500",   out: "bg-red-500" };

const SAMPLE_ITEMS = [
    { name: "กระจกใส 6mm",  spec: "Clear • 6mm",    qty: 45, reorder: 20, loc: "A1", type: "Raw"   },
    { name: "กระจกฝ้า 4mm", spec: "Frosted • 4mm",  qty:  8, reorder: 20, loc: "B2", type: "Raw"   },
    { name: "กระจกดำ 8mm",  spec: "Dark • 8mm",      qty:  0, reorder: 10, loc: "A3", type: "Reuse" },
    { name: "กระจกชา 10mm", spec: "Bronze • 10mm",   qty: 30, reorder: 15, loc: "C1", type: "Raw"   },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function InventoryStockBlock({
    title       = "สต็อกวัสดุในคลัง",
    maxItems    = 8,
    stockFilter = "all",
    showSearch  = true,
}: InventoryStockBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();

    const [inventories, setInventories] = useState<Inventory[]>([]);
    const [loading, setLoading]         = useState(false);
    const [search,  setSearch]          = useState("");

    useEffect(() => { if (isPreview) loadData(); }, [isPreview]);

    // Real-time updates via WebSocket
    useWebSocket("inventory", ["inventory:updated", "material:updated"], () => {
        if (isPreview) loadData();
    });

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await inventoriesApi.getAll();
            if (res.success) setInventories(res.data);
        } finally {
            setLoading(false);
        }
    };

    const getStatus = (inv: Inventory) =>
        stockLevel(inv.quantity, getMat(inv.material as unknown as Material)?.reorderPoint ?? 0);

    const filtered = inventories
        .filter(inv => {
            const s = getStatus(inv);
            if (stockFilter === "low" && s !== "low") return false;
            if (stockFilter === "out" && s !== "out") return false;
            if (search) {
                const q = search.toLowerCase();
                return (
                    getName(inv.material as unknown as Material).toLowerCase().includes(q) ||
                    getSpecs(inv.material as unknown as Material).toLowerCase().includes(q) ||
                    inv.location.toLowerCase().includes(q)
                );
            }
            return true;
        })
        .slice(0, maxItems);

    // ── Design mode ────────────────────────────────────────────────────────────
    if (!isPreview) {
        return (
            <div
                ref={(ref) => { ref && connect(drag(ref)); }}
                className={`w-full rounded-xl border-2 cursor-grab transition-all overflow-hidden
                    ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`}
            >
                <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border/50">
                    <Boxes className="h-4 w-4 text-emerald-600" />
                    <span className="text-sm font-semibold">{title}</span>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-muted border text-muted-foreground">
                        {stockFilter === "all" ? "ทั้งหมด" : stockFilter === "low" ? "สต็อกต่ำ" : "หมดสต็อก"}
                    </span>
                </div>
                <div className="p-3 grid grid-cols-2 gap-2">
                    {SAMPLE_ITEMS.map((item, i) => {
                        const s = stockLevel(item.qty, item.reorder);
                        const pct = Math.min(100, item.reorder > 0 ? (item.qty / (item.reorder * 2)) * 100 : (item.qty > 0 ? 100 : 0));
                        return (
                            <div key={i} className="rounded-lg border bg-background p-2.5 space-y-1.5">
                                <div className="flex items-start justify-between gap-1">
                                    <p className="text-xs font-medium leading-tight">{item.name}</p>
                                    {STATUS_ICON[s]}
                                </div>
                                <p className="text-[10px] text-muted-foreground">{item.spec}</p>
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-bold ${STATUS_TEXT[s]}`}>{item.qty} ชิ้น</span>
                                    <div className="flex items-center gap-1">
                                        <span className={`text-[9px] px-1 py-0.5 rounded ${item.type === "Raw" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>{item.type}</span>
                                        <span className="text-[9px] text-muted-foreground">{item.loc}</span>
                                    </div>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className={`h-full rounded-full ${STATUS_BAR[s]}`} style={{ width: `${pct}%` }} />
                                </div>
                                <p className="text-[9px] text-muted-foreground">จุดสั่ง: {item.reorder} ชิ้น</p>
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
                <Boxes className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold">{title}</span>
                <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{filtered.length}</span>
                <button onClick={loadData} disabled={loading} className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
            </div>

            {/* Search */}
            {showSearch && (
                <div className="px-3 py-2 border-b">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="ค้นหาวัสดุ..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                        />
                    </div>
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="p-3 grid grid-cols-2 gap-2">
                    {[1,2,3,4].map(i => <div key={i} className="h-24 rounded-lg bg-muted/30 animate-pulse" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="p-8 text-center">
                    <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">ไม่พบรายการวัสดุ</p>
                </div>
            ) : (
                <div className="p-3 grid grid-cols-2 gap-2">
                    {filtered.map(inv => {
                        const mat    = getMat(inv.material as unknown as Material);
                        const name   = getName(inv.material as unknown as Material);
                        const specs  = getSpecs(inv.material as unknown as Material);
                        const unit   = mat?.unit ?? "ชิ้น";
                        const reorder = mat?.reorderPoint ?? 0;
                        const s      = getStatus(inv);
                        const pct    = Math.min(100, reorder > 0 ? (inv.quantity / (reorder * 2)) * 100 : (inv.quantity > 0 ? 100 : 0));
                        return (
                            <div key={inv._id} className="rounded-lg border bg-background p-2.5 space-y-1.5">
                                <div className="flex items-start justify-between gap-1">
                                    <p className="text-xs font-medium leading-tight line-clamp-2">{name}</p>
                                    {STATUS_ICON[s]}
                                </div>
                                {specs && <p className="text-[10px] text-muted-foreground">{specs}</p>}
                                <div className="flex items-center justify-between">
                                    <span className={`text-xs font-bold ${STATUS_TEXT[s]}`}>
                                        {inv.quantity} {unit}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <span className={`text-[9px] px-1 py-0.5 rounded ${
                                            inv.stockType === "Raw"
                                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                                : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                                        }`}>{inv.stockType}</span>
                                        {inv.location && <span className="text-[9px] text-muted-foreground">{inv.location}</span>}
                                    </div>
                                </div>
                                {/* Stock bar */}
                                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${STATUS_BAR[s]}`} style={{ width: `${pct}%` }} />
                                </div>
                                {reorder > 0 && <p className="text-[9px] text-muted-foreground">จุดสั่ง: {reorder} {unit}</p>}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

InventoryStockBlock.craft = {
    displayName: "Inventory Stock",
    props: {
        title:       "สต็อกวัสดุในคลัง",
        maxItems:    8,
        stockFilter: "all",
        showSearch:  true,
    } as InventoryStockBlockProps,
};
