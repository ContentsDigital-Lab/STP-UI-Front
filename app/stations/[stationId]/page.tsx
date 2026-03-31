"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, LayoutTemplate, Settings2, Bell, Package, X, PackageOpen, FileWarning, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getStationTemplate } from "@/lib/api/station-templates";
import { StationTemplate } from "@/lib/types/station-designer";

/** Backend populates templateId — can be a plain string ID or the full template object */
type PopulatedStation = Omit<Station, "templateId"> & { templateId?: string | StationTemplate };
import { stationsApi } from "@/lib/api/stations";
import { ordersApi } from "@/lib/api/orders";
import { requestsApi } from "@/lib/api/requests";
import { Station, Order, Customer, Material } from "@/lib/api/types";
import { getColorOption } from "@/lib/stations/stations-store";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { useCheckinSocket } from "@/lib/hooks/use-checkin-socket";
import { playNotificationSound } from "@/lib/notification-sounds";
import { QRCodeSVG } from "qrcode.react";
import { WithdrawModal } from "@/components/stations/WithdrawModal";
import { ClaimModal } from "@/components/stations/ClaimModal";

// ⚠️ Craft.js uses browser APIs — disable SSR
const DesignerCanvas = dynamic(
    () => import("@/components/stations/designer/DesignerCanvas").then((m) => m.DesignerCanvas),
    { ssr: false, loading: () => <LoadingSpinner /> },
);

function LoadingSpinner() {
    return (
        <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">กำลังโหลดสถานี...</p>
            </div>
        </div>
    );
}

// ─── New job toast ────────────────────────────────────────────────────────────

function NewJobToast({ order, stationName, toastId }: {
    order: Order;
    stationName: string;
    toastId: string | number;
}) {
    const customerName = typeof order.customer === "object"
        ? (order.customer as Customer).name
        : (order.customer ?? "—");
    const materialName = typeof order.material === "object"
        ? (order.material as Material).name
        : (order.material ?? "—");

    return (
        <div className="flex items-start gap-3 bg-background border-2 border-blue-500/40 rounded-2xl shadow-2xl p-4 w-80">
            <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500 shrink-0 animate-pulse">
                <Bell className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-500 uppercase tracking-wider">มีงานใหม่เข้าสถานี!</p>
                <p className="font-bold text-sm text-foreground mt-0.5 flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    {order.code ? `#${order.code}` : `…${order._id.slice(-6)}`}
                </p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{customerName}</p>
                <p className="text-xs text-muted-foreground truncate">{materialName} × {order.quantity}</p>
                <p className="text-[10px] text-blue-400 font-medium mt-1">📍 {stationName}</p>
            </div>
            <button
                onClick={() => toast.dismiss(toastId)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LiveStationPage() {
    const params        = useParams();
    const router        = useRouter();
    const searchParams  = useSearchParams();
    const stationId     = params.stationId as string;
    const orderId       = searchParams.get("orderId");
    const requestId     = searchParams.get("requestId");

    const [station,      setStation]      = useState<Station | null>(null);
    const [template,     setTemplate]     = useState<StationTemplate | null>(null);
    const [loading,      setLoading]      = useState(true);
    const [noTemplate,   setNoTemplate]   = useState(false);
    const [orderData,    setOrderData]    = useState<Record<string, unknown> | null>(null);
    const [requestData,  setRequestData]  = useState<Record<string, unknown> | null>(null);
    const [showCheckinQr,   setShowCheckinQr]   = useState(false);
    const [showWithdraw,    setShowWithdraw]    = useState(false);
    const [showClaim,       setShowClaim]       = useState(false);

    // ── Track known orders at this station to detect new arrivals ─────────────
    const knownOrderIdsRef = useRef<Set<string>>(new Set());
    const stationRef       = useRef<Station | null>(null);
    useEffect(() => { stationRef.current = station; }, [station]);

    // Seed known orders on mount — so we don't notify about existing work
    useEffect(() => {
        ordersApi.getAll({ stationId }).then(res => {
            if (res.success && res.data) {
                (res.data as Order[]).forEach(o => knownOrderIdsRef.current.add(o._id));
            }
        }).catch(() => {/* ignore — worst case we notify once on mount */});
    }, [stationId]);

    // ── Websocket: detect orders newly assigned to this station ───────────────
    const showNewJobToast = useCallback((order: Order) => {
        if (knownOrderIdsRef.current.has(order._id)) return;
        knownOrderIdsRef.current.add(order._id);
        playNotificationSound("high").catch(() => {});
        const name = stationRef.current?.name ?? "สถานีนี้";
        const toastId = `job-${order._id}`;
        toast.custom(
            (id) => <NewJobToast order={order} stationName={name} toastId={id} />,
            { id: toastId, duration: 12000, position: "top-right" },
        );
    }, []);

    const handleSocketEvent = useCallback(async (event: string, data: unknown) => {
        // Direct notification from station room — fetch and show immediately
        if (event === "notification") {
            const notif = data as { type?: string; referenceId?: string };
            if (notif?.type === "order_arrived" && notif.referenceId) {
                try {
                    const res = await ordersApi.getById(notif.referenceId);
                    if (res.success && res.data) showNewJobToast(res.data as Order);
                } catch { /* ignore */ }
            }
            return;
        }

        // Fallback: poll all orders at this station on any order:updated event
        if (event !== "order:updated") return;
        try {
            const res = await ordersApi.getAll({ stationId });
            if (!res.success || !res.data) return;
            const orders = res.data as Order[];

            for (const order of orders) showNewJobToast(order);

            // Remove orders that left this station
            const currentIds = new Set(orders.map(o => o._id));
            for (const id of knownOrderIdsRef.current) {
                if (!currentIds.has(id)) knownOrderIdsRef.current.delete(id);
            }
        } catch { /* ignore */ }
    }, [stationId, showNewJobToast]);

    useWebSocket("order", ["order:updated"], handleSocketEvent, { stationRoom: stationId });

    // ── Worker check-in via QR ──────────────────────────────────────────────────
    const { onCheckin } = useCheckinSocket(station?.name ?? null);
    useEffect(() => {
        onCheckin(({ worker, time }) => {
            playNotificationSound("high").catch(() => {});
            const toastId = `checkin-${Date.now()}`;
            toast.custom(
                (id) => (
                    <div className="flex items-start gap-3 bg-background border-2 border-emerald-500/40 rounded-2xl shadow-2xl p-4 w-80">
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
                            <UserCheck className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">พนักงานเช็คอิน!</p>
                            <p className="font-bold text-sm text-foreground mt-0.5">{worker}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">เวลา {time}</p>
                            <p className="text-[10px] text-emerald-400 font-medium mt-1">📍 {stationRef.current?.name ?? "สถานีนี้"}</p>
                        </div>
                        <button onClick={() => toast.dismiss(id)} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                ),
                { id: toastId, duration: 10000, position: "top-right" },
            );
            setShowCheckinQr(false);
        });
    }, [onCheckin]);

    // ── Load station + template ────────────────────────────────────────────────
    useEffect(() => {
        stationsApi.getById(stationId)
            .then((res) => {
                const found = res.success ? (res.data as unknown as PopulatedStation) : null;
                setStation(found as unknown as Station);

                if (!found?.templateId) {
                    setNoTemplate(true);
                    setLoading(false);
                    return;
                }

                if (typeof found.templateId === "object" && "_id" in found.templateId) {
                    setTemplate(found.templateId as StationTemplate);
                    return;
                }

                return getStationTemplate(found.templateId as string)
                    .then((t) => {
                        if (t) setTemplate(t);
                        else { toast.error("โหลด template ไม่สำเร็จ"); setNoTemplate(true); }
                    });
            })
            .catch(() => { toast.error("โหลดสถานีไม่สำเร็จ"); setNoTemplate(true); })
            .finally(() => setLoading(false));
    }, [stationId]);

    useEffect(() => {
        if (!orderId) return;
        ordersApi.getById(orderId)
            .then((res) => { if (res.success && res.data) setOrderData(res.data as unknown as Record<string, unknown>); })
            .catch(() => toast.error("โหลดข้อมูลออเดอร์ไม่สำเร็จ"));
    }, [orderId]);

    useEffect(() => {
        if (!requestId) return;
        requestsApi.getById(requestId)
            .then((res) => { if (res.success && res.data) setRequestData(res.data as unknown as Record<string, unknown>); })
            .catch(() => toast.error("โหลดข้อมูลบิลไม่สำเร็จ"));
    }, [requestId]);

    const color = station ? getColorOption(station.colorId) : null;

    const checkinUrl = typeof window !== "undefined"
        ? `${window.location.origin}/stations/${stationId}/checkin`
        : "";

    const header = (
        <div className="flex items-center gap-2 border-b-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 px-3 py-2 shrink-0">
            <button
                onClick={() => router.push("/stations")}
                className="flex items-center gap-1.5 h-11 px-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 font-bold text-sm active:bg-gray-100 dark:active:bg-slate-700 shrink-0"
            >
                <ArrowLeft className="h-5 w-5" />
                <span className="hidden sm:inline">กลับ</span>
            </button>
            {station && color && (
                <span className={`text-sm font-bold px-3 py-1.5 rounded-xl shrink-0 ${color.cls}`}>
                    {station.name}
                </span>
            )}
            <div className="ml-auto flex items-center gap-2 shrink-0">
                <button
                    onClick={() => setShowWithdraw(true)}
                    className="flex items-center gap-1.5 h-11 px-4 rounded-xl border-2 border-orange-600 dark:border-orange-500 bg-white dark:bg-slate-800 text-orange-700 dark:text-orange-400 font-bold text-sm active:bg-orange-50 dark:active:bg-orange-900/20"
                >
                    <PackageOpen className="h-5 w-5" />
                    <span>เบิก</span>
                </button>
                <button
                    onClick={() => setShowClaim(true)}
                    className="flex items-center gap-1.5 h-11 px-4 rounded-xl bg-red-600 text-white font-bold text-sm border-2 border-red-700 active:bg-red-700"
                >
                    <FileWarning className="h-5 w-5" />
                    <span>เคลม</span>
                </button>
            </div>
        </div>
    );

    const checkinQrPopup = showCheckinQr && checkinUrl && (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setShowCheckinQr(false)}
        >
            <div
                className="bg-card rounded-2xl border shadow-2xl w-full max-w-sm"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <div className="flex items-center gap-2">
                        <UserCheck className="h-4 w-4 text-primary" />
                        <span className="text-sm font-semibold">สแกนเพื่อเช็คอิน</span>
                    </div>
                    <button
                        onClick={() => setShowCheckinQr(false)}
                        className="p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex flex-col items-center gap-4 px-5 pb-6">
                    <div className="p-4 bg-white rounded-2xl border shadow-inner">
                        <QRCodeSVG
                            value={checkinUrl}
                            size={220}
                            bgColor="#ffffff"
                            fgColor="#000000"
                            level="H"
                            marginSize={4}
                        />
                    </div>
                    <div className="text-center space-y-1">
                        <p className="text-sm font-semibold text-foreground">
                            สถานี: {station?.name ?? stationId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            ให้พนักงานสแกน QR นี้ด้วยมือถือเพื่อเช็คอินเข้าสถานี
                        </p>
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 font-mono break-all text-center">
                        {checkinUrl}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => setShowCheckinQr(false)}
                    >
                        ปิด
                    </Button>
                </div>
            </div>
        </div>
    );

    if (loading) return <div className="flex h-full flex-col">{header}<LoadingSpinner /></div>;

    if (noTemplate || !template) {
        return (
            <div className="flex h-full flex-col">
                {header}
                <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
                    <div className="p-4 rounded-2xl bg-muted/50">
                        <LayoutTemplate className="h-12 w-12 text-muted-foreground/40" />
                    </div>
                    <div className="text-center space-y-1">
                        <p className="font-semibold text-foreground">ยังไม่ได้กำหนด Template</p>
                        <p className="text-sm text-muted-foreground">กรุณาแก้ไขสถานีและเลือก template ก่อนเริ่มงาน</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => router.push("/stations")}>
                            <ArrowLeft className="h-4 w-4 mr-1.5" />กลับ
                        </Button>
                        <Button onClick={() => router.push("/stations")} className="gap-2">
                            <Settings2 className="h-4 w-4" />แก้ไขสถานี
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-x-hidden">
            {header}
            <div className="flex-1 overflow-hidden max-w-full">
                <DesignerCanvas
                    templateName={template.name}
                    initialNodes={template.uiSchema && typeof template.uiSchema === "object" && !Array.isArray(template.uiSchema) && Object.keys(template.uiSchema).length > 0 ? template.uiSchema as Record<string, unknown> : undefined}
                    onSave={async () => {}}
                    saving={false}
                    previewOnly
                    stationId={stationId}
                    stationName={station?.name ?? null}
                    initialData={orderData}
                    initialRequestData={requestData}
                />
            </div>
            {checkinQrPopup}
            {showWithdraw && <WithdrawModal stationId={stationId} onClose={() => setShowWithdraw(false)} />}
            {showClaim    && <ClaimModal    stationId={stationId} onClose={() => setShowClaim(false)}    />}
        </div>
    );
}
