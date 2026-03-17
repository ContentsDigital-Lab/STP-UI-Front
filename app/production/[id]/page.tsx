"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, CheckCircle2, XCircle, Loader2, Clock,
    User, Package, Calendar, MapPin, Hash, ChevronUp,
    ChevronDown, Plus, X, Save, AlertCircle, Factory,
    GripVertical, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ordersApi } from "@/lib/api/orders";
import { requestsApi } from "@/lib/api/requests";
import { Order, OrderRequest, Customer, Worker, Material } from "@/lib/api/types";

// ── predefined production stations ───────────────────────────────────────────
const STATION_OPTIONS = [
    { id: "cutting",    label: "ตัดกระจก",       color: "bg-blue-500"   },
    { id: "grinding",   label: "เจียระนาย",       color: "bg-purple-500" },
    { id: "drilling",   label: "เจาะ",             color: "bg-orange-500" },
    { id: "tempering",  label: "อบ/เทมเปอร์",     color: "bg-red-500"    },
    { id: "laminating", label: "ลามิเนต",          color: "bg-teal-500"   },
    { id: "coating",    label: "เคลือบ",           color: "bg-indigo-500" },
    { id: "framing",    label: "ใส่กรอบ",          color: "bg-yellow-600" },
    { id: "inspection", label: "ตรวจสอบคุณภาพ",   color: "bg-green-500"  },
    { id: "packing",    label: "บรรจุ",            color: "bg-slate-500"  },
    { id: "delivery",   label: "จัดส่ง",           color: "bg-cyan-500"   },
] as const;

type StationId = typeof STATION_OPTIONS[number]["id"];

const STATUS_LABELS: Record<string, string> = {
    pending:     "รอตรวจสอบ",
    in_progress: "กำลังผลิต",
    completed:   "เสร็จแล้ว",
    cancelled:   "ยกเลิก",
};

// ── helpers ───────────────────────────────────────────────────────────────────
function getStr(v: string | { name: string } | null | undefined, field: "name" | "_id" = "name") {
    if (!v) return "—";
    if (typeof v === "object") return (v as Record<string, string>)[field] ?? "—";
    return v;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className="flex items-start gap-3 py-2.5 border-b last:border-0">
            <div className="p-1.5 rounded-lg bg-muted/50 text-muted-foreground mt-0.5">
                <Icon className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">{label}</p>
                <p className="text-sm text-foreground mt-0.5">{value}</p>
            </div>
        </div>
    );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function ProductionDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    const [order,    setOrder]    = useState<Order | null>(null);
    const [request,  setRequest]  = useState<OrderRequest | null>(null);
    const [loading,  setLoading]  = useState(true);
    const [saving,   setSaving]   = useState(false);
    const [saved,    setSaved]    = useState(false);
    const [error,    setError]    = useState<string | null>(null);

    // station sequence editor state
    const [sequence, setSequence] = useState<StationId[]>([]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await ordersApi.getById(id);
            if (!res.success) { setError(res.message); return; }
            const o = res.data;
            setOrder(o);
            // init sequence from saved stations
            if (o.stations?.length) {
                setSequence(o.stations.filter((s): s is StationId =>
                    STATION_OPTIONS.some((opt) => opt.id === s)
                ));
            }
            // load linked request
            const reqId = o.request && typeof o.request === "object" ? (o.request as OrderRequest)._id : o.request;
            if (reqId) {
                const rr = await requestsApi.getById(reqId).catch(() => null);
                if (rr?.success) setRequest(rr.data);
            }
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    // ── sequence helpers ───────────────────────────────────────────────────
    const addStation = (sid: StationId) => {
        if (!sequence.includes(sid)) setSequence((p) => [...p, sid]);
    };
    const removeStation = (idx: number) => setSequence((p) => p.filter((_, i) => i !== idx));
    const moveUp   = (idx: number) => setSequence((p) => { const a = [...p]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; return a; });
    const moveDown = (idx: number) => setSequence((p) => { const a = [...p]; [a[idx], a[idx+1]] = [a[idx+1], a[idx]]; return a; });

    // ── status change ──────────────────────────────────────────────────────
    const changeStatus = async (newStatus: Order["status"]) => {
        if (!order) return;
        setSaving(true);
        try {
            const res = await ordersApi.update(order._id, { status: newStatus });
            if (res.success) setOrder((o) => o ? { ...o, status: newStatus } : o);
        } finally {
            setSaving(false);
        }
    };

    // ── save station sequence ──────────────────────────────────────────────
    const saveSequence = async () => {
        if (!order) return;
        setSaving(true);
        setSaved(false);
        try {
            const res = await ordersApi.update(order._id, { stations: sequence });
            if (res.success) {
                setOrder((o) => o ? { ...o, stations: sequence } : o);
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            }
        } finally {
            setSaving(false);
        }
    };

    const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }) : "—";

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    );
    if (error || !order) return (
        <div className="p-6 flex flex-col items-center gap-4">
            <AlertCircle className="h-10 w-10 text-destructive/50" />
            <p className="text-sm text-muted-foreground">{error ?? "ไม่พบข้อมูล"}</p>
            <Button variant="outline" onClick={() => router.back()}>กลับ</Button>
        </div>
    );

    const available = STATION_OPTIONS.filter((s) => !sequence.includes(s.id));

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            {/* Back + title */}
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Factory className="h-5 w-5 text-primary" />
                        คำสั่งผลิต #{order._id.slice(-6).toUpperCase()}
                    </h1>
                    <p className="text-xs text-muted-foreground">สร้างเมื่อ {fmtDate(order.createdAt)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ── Left: order info + request (bill) details ─────────── */}
                <div className="space-y-4">
                    {/* Order status card */}
                    <div className="rounded-xl border bg-card p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold">สถานะคำสั่งผลิต</h2>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                order.status === "pending"     ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                order.status === "in_progress" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                                order.status === "completed"   ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                                                                  "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            }`}>
                                {STATUS_LABELS[order.status]}
                            </span>
                        </div>

                        {/* Action buttons by current status */}
                        <div className="flex flex-wrap gap-2">
                            {order.status === "pending" && (
                                <>
                                    <Button
                                        size="sm"
                                        className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                                        disabled={saving || sequence.length === 0}
                                        onClick={() => changeStatus("in_progress")}
                                        title={sequence.length === 0 ? "กำหนดสถานีก่อนอนุมัติ" : ""}
                                    >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        อนุมัติ & เริ่มผลิต
                                    </Button>
                                    <Button size="sm" variant="outline" className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50" disabled={saving} onClick={() => changeStatus("cancelled")}>
                                        <XCircle className="h-3.5 w-3.5" />
                                        ปฏิเสธ
                                    </Button>
                                </>
                            )}
                            {order.status === "in_progress" && (
                                <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white" disabled={saving} onClick={() => changeStatus("completed")}>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    ทำเครื่องหมายเสร็จแล้ว
                                </Button>
                            )}
                            {(order.status === "completed" || order.status === "cancelled") && (
                                <p className="text-xs text-muted-foreground italic">คำสั่งผลิตนี้ปิดแล้ว</p>
                            )}
                        </div>

                        {order.status === "pending" && sequence.length === 0 && (
                            <p className="text-xs text-amber-600 flex items-center gap-1">
                                <Info className="h-3.5 w-3.5" />
                                กรุณากำหนดลำดับสถานีก่อนอนุมัติ
                            </p>
                        )}
                    </div>

                    {/* Order details */}
                    <div className="rounded-xl border bg-card p-4">
                        <h2 className="text-sm font-semibold mb-2">ข้อมูลออเดอร์</h2>
                        <InfoRow icon={User}     label="ลูกค้า"       value={getStr(order.customer)} />
                        <InfoRow icon={Package}  label="วัสดุ"        value={getStr(order.material)} />
                        <InfoRow icon={Hash}     label="จำนวน"        value={`${order.quantity} ชิ้น`} />
                        <InfoRow icon={User}     label="มอบหมายให้"   value={getStr(order.assignedTo)} />
                        <InfoRow icon={Clock}    label="ความสำคัญ"    value={`P${order.priority}`} />
                    </div>

                    {/* Request (bill) details */}
                    {request && (
                        <div className="rounded-xl border bg-card p-4">
                            <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                <Info className="h-4 w-4 text-muted-foreground" />
                                ข้อมูลบิล (Order Request)
                            </h2>
                            <InfoRow icon={Package}  label="ประเภทสินค้า"    value={request.details?.type ?? "—"} />
                            <InfoRow icon={Hash}     label="จำนวน (บิล)"     value={`${request.details?.quantity ?? "—"} ชิ้น`} />
                            <InfoRow icon={Hash}     label="ราคาประมาณ"      value={`฿${(request.details?.estimatedPrice ?? 0).toLocaleString()}`} />
                            <InfoRow icon={Calendar} label="กำหนดส่ง"        value={fmtDate(request.deadline)} />
                            <InfoRow icon={MapPin}   label="สถานที่ส่ง"      value={request.deliveryLocation ?? "—"} />
                        </div>
                    )}
                </div>

                {/* ── Right: station sequence editor ────────────────────── */}
                <div className="space-y-4">
                    <div className="rounded-xl border bg-card p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-semibold flex items-center gap-2">
                                <Factory className="h-4 w-4 text-primary" />
                                ลำดับสถานีการผลิต
                            </h2>
                            <Button
                                size="sm"
                                disabled={saving}
                                onClick={saveSequence}
                                className={`h-8 gap-1.5 ${saved ? "bg-green-600 hover:bg-green-700" : ""}`}
                            >
                                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                                {saved ? "บันทึกแล้ว" : "บันทึก"}
                            </Button>
                        </div>

                        {/* Current sequence */}
                        {sequence.length === 0 ? (
                            <div className="rounded-lg border-2 border-dashed border-muted-foreground/20 p-6 text-center">
                                <Factory className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
                                <p className="text-xs text-muted-foreground">ยังไม่ได้กำหนดสถานี</p>
                                <p className="text-[11px] text-muted-foreground/60 mt-1">เลือกสถานีจากรายการด้านล่าง</p>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {sequence.map((sid, idx) => {
                                    const opt = STATION_OPTIONS.find((s) => s.id === sid)!;
                                    return (
                                        <div key={sid} className="flex items-center gap-2 rounded-lg border bg-background p-2.5 group">
                                            <GripVertical className="h-4 w-4 text-muted-foreground/30 shrink-0" />
                                            <span className={`h-2 w-2 rounded-full shrink-0 ${opt.color}`} />
                                            <span className="flex-1 text-sm font-medium">
                                                <span className="text-muted-foreground text-xs mr-1.5">{idx + 1}.</span>
                                                {opt.label}
                                            </span>
                                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button disabled={idx === 0} onClick={() => moveUp(idx)} className="p-1 rounded hover:bg-muted disabled:opacity-30">
                                                    <ChevronUp className="h-3.5 w-3.5" />
                                                </button>
                                                <button disabled={idx === sequence.length - 1} onClick={() => moveDown(idx)} className="p-1 rounded hover:bg-muted disabled:opacity-30">
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                </button>
                                                <button onClick={() => removeStation(idx)} className="p-1 rounded hover:bg-red-100 hover:text-red-600 text-muted-foreground">
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Flow arrow visual */}
                        {sequence.length > 1 && (
                            <div className="flex items-center gap-1 overflow-x-auto pb-1">
                                {sequence.map((sid, idx) => {
                                    const opt = STATION_OPTIONS.find((s) => s.id === sid)!;
                                    return (
                                        <div key={sid} className="flex items-center gap-1 shrink-0">
                                            <span className={`px-2 py-0.5 rounded-full text-white text-[10px] font-medium ${opt.color}`}>
                                                {opt.label}
                                            </span>
                                            {idx < sequence.length - 1 && (
                                                <span className="text-muted-foreground/40 text-xs">→</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Available stations to add */}
                        <div className="pt-2 border-t">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                                เพิ่มสถานี
                            </p>
                            {available.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">เลือกทุกสถานีแล้ว</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {available.map((opt) => (
                                        <button
                                            key={opt.id}
                                            onClick={() => addStation(opt.id)}
                                            className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:border-primary/40 hover:bg-muted/30 transition-colors"
                                        >
                                            <span className={`h-2 w-2 rounded-full ${opt.color}`} />
                                            {opt.label}
                                            <Plus className="h-3 w-3 text-muted-foreground" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
