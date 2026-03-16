"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
    ClipboardCheck, Search, ChevronRight, Clock, User,
    Package, AlertCircle, CheckCircle2, XCircle, Loader2,
    ArrowRight, SlidersHorizontal, RefreshCw, QrCode,
} from "lucide-react";
import { QrCodeModal } from "@/components/qr/QrCodeModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ordersApi } from "@/lib/api/orders";
import { requestsApi } from "@/lib/api/requests";
import { Order, OrderRequest, Customer, Worker, Material } from "@/lib/api/types";

// ── helpers ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
    pending:     { label: "รอตรวจสอบ",     icon: Clock,         color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",   dot: "bg-amber-400"  },
    in_progress: { label: "กำลังผลิต",     icon: Loader2,       color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",         dot: "bg-blue-500"   },
    completed:   { label: "เสร็จแล้ว",     icon: CheckCircle2,  color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",     dot: "bg-green-500"  },
    cancelled:   { label: "ยกเลิก",        icon: XCircle,       color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",             dot: "bg-red-400"    },
} as const;

type StatusKey = keyof typeof STATUS_CONFIG;

function getCustomerName(c: string | Customer | null | undefined) {
    if (!c) return "—";
    return typeof c === "object" ? c.name : c;
}
function getMaterialName(m: string | Material | null | undefined) {
    if (!m) return "—";
    return typeof m === "object" ? m.name : m;
}
function getWorkerName(w: string | Worker | null | undefined) {
    if (!w) return "—";
    return typeof w === "object" ? w.name : w;
}

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status as StatusKey] ?? STATUS_CONFIG.pending;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function ProductionPage() {
    const router = useRouter();
    const [orders,   setOrders]   = useState<Order[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [search,   setSearch]   = useState("");
    const [filter,   setFilter]   = useState<"all" | StatusKey>("all");
    const [qrTarget, setQrTarget] = useState<{ code: string; label: string; url: string } | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await ordersApi.getAll();
            if (res.success) setOrders(res.data ?? []);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const filtered = orders.filter((o) => {
        if (filter !== "all" && o.status !== filter) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            o._id.toLowerCase().includes(q) ||
            getCustomerName(o.customer).toLowerCase().includes(q) ||
            getMaterialName(o.material).toLowerCase().includes(q)
        );
    });

    // counts per status
    const counts = Object.fromEntries(
        (Object.keys(STATUS_CONFIG) as StatusKey[]).map((s) => [s, orders.filter((o) => o.status === s).length])
    ) as Record<StatusKey, number>;

    const fmtDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

    return (
        <>
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <ClipboardCheck className="h-6 w-6 text-primary" />
                        ตรวจสอบคำสั่งผลิต
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        อนุมัติและกำหนดลำดับสถานีการผลิต
                    </p>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    รีเฟรช
                </Button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(Object.entries(STATUS_CONFIG) as [StatusKey, typeof STATUS_CONFIG[StatusKey]][]).map(([key, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                        <button
                            key={key}
                            onClick={() => setFilter(filter === key ? "all" : key)}
                            className={`rounded-xl border p-4 text-left transition-all hover:shadow-md ${filter === key ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "bg-card hover:border-primary/30"}`}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                                <span className="text-xs text-muted-foreground">{cfg.label}</span>
                            </div>
                            <p className="text-2xl font-bold">{loading ? "…" : counts[key]}</p>
                        </button>
                    );
                })}
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="ค้นหา รหัส, ลูกค้า, วัสดุ..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 h-9"
                    />
                </div>
                <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                    <SelectTrigger className="h-9 w-40">
                        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">ทุกสถานะ</SelectItem>
                        {(Object.entries(STATUS_CONFIG) as [StatusKey, typeof STATUS_CONFIG[StatusKey]][]).map(([k, c]) => (
                            <SelectItem key={k} value={k}>{c.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            {loading ? (
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-16 rounded-xl border bg-muted/30 animate-pulse" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3 border-2 border-dashed rounded-xl">
                    <AlertCircle className="h-10 w-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">ไม่พบคำสั่งผลิต</p>
                </div>
            ) : (
                <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b bg-muted/30 text-xs text-muted-foreground uppercase tracking-wide">
                                <th className="px-4 py-2.5 text-left font-semibold">รหัสออเดอร์</th>
                                <th className="px-4 py-2.5 text-left font-semibold">ลูกค้า</th>
                                <th className="px-4 py-2.5 text-left font-semibold">วัสดุ</th>
                                <th className="px-4 py-2.5 text-left font-semibold">จำนวน</th>
                                <th className="px-4 py-2.5 text-left font-semibold">สถานี</th>
                                <th className="px-4 py-2.5 text-left font-semibold">สถานะ</th>
                                <th className="px-4 py-2.5 text-left font-semibold">วันที่</th>
                                <th className="px-4 py-2.5 text-left font-semibold">QR</th>
                                <th className="px-4 py-2.5" />
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filtered.map((order) => (
                                <tr
                                    key={order._id}
                                    className="hover:bg-muted/20 cursor-pointer transition-colors"
                                    onClick={() => router.push(`/production/${order._id}`)}
                                >
                                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                                        {order.code
                                            ? <span className="font-bold text-foreground">#{order.code}</span>
                                            : <span>#{order._id.slice(-6).toUpperCase()}</span>
                                        }
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <User className="h-3.5 w-3.5 text-muted-foreground/60" />
                                            <span>{getCustomerName(order.customer)}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            <Package className="h-3.5 w-3.5 text-muted-foreground/60" />
                                            <span>{getMaterialName(order.material)}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-center font-medium">{order.quantity}</td>
                                    <td className="px-4 py-3">
                                        {order.stations?.length ? (
                                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                                <span className="font-medium text-foreground">{order.stations.length}</span> สถานี
                                            </span>
                                        ) : (
                                            <span className="text-xs text-amber-600 font-medium">ยังไม่กำหนด</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={order.status} />
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground">
                                        {fmtDate(order.createdAt)}
                                    </td>
                                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        {order.code ? (
                                            <button
                                                type="button"
                                                title={`QR Code #${order.code}`}
                                                onClick={() => setQrTarget({
                                                    code:  order.code!,
                                                    label: `${getMaterialName(order.material)} — ${getCustomerName(order.customer)}`,
                                                    url:   `${window.location.origin}/production/${order._id}`,
                                                })}
                                                className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                            >
                                                <QrCode className="h-4 w-4" />
                                            </button>
                                        ) : (
                                            <span className="text-xs text-muted-foreground/40">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        {qrTarget && (
            <QrCodeModal
                code={qrTarget.code}
                label={qrTarget.label}
                value={qrTarget.url}
                onClose={() => setQrTarget(null)}
            />
        )}
        </>
    );
}
