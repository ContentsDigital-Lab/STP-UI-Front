"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, LayoutTemplate, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getStationTemplate } from "@/lib/api/station-templates";
import { StationTemplate } from "@/lib/types/station-designer";

/** Backend populates templateId — can be a plain string ID or the full template object */
type PopulatedStation = Omit<Station, "templateId"> & { templateId?: string | StationTemplate };
import { stationsApi } from "@/lib/api/stations";
import { ordersApi } from "@/lib/api/orders";
import { requestsApi } from "@/lib/api/requests";
import { Station } from "@/lib/api/types";
import { getColorOption } from "@/lib/stations/stations-store";

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

                // Backend populates templateId — may already be the full template object
                if (typeof found.templateId === "object" && "_id" in found.templateId) {
                    setTemplate(found.templateId as StationTemplate);
                    return;
                }

                // Fallback: plain string ID — fetch separately
                return getStationTemplate(found.templateId as string)
                    .then((t) => {
                        if (t) setTemplate(t);
                        else { toast.error("โหลด template ไม่สำเร็จ"); setNoTemplate(true); }
                    });
            })
            .catch(() => { toast.error("โหลดสถานีไม่สำเร็จ"); setNoTemplate(true); })
            .finally(() => setLoading(false));
    }, [stationId]);

    // Fetch order when orderId is provided
    useEffect(() => {
        if (!orderId) return;
        ordersApi.getById(orderId)
            .then((res) => { if (res.success && res.data) setOrderData(res.data as unknown as Record<string, unknown>); })
            .catch(() => toast.error("โหลดข้อมูลออเดอร์ไม่สำเร็จ"));
    }, [orderId]);

    // Fetch request (บิล) when requestId is provided
    useEffect(() => {
        if (!requestId) return;
        requestsApi.getById(requestId)
            .then((res) => { if (res.success && res.data) setRequestData(res.data as unknown as Record<string, unknown>); })
            .catch(() => toast.error("โหลดข้อมูลบิลไม่สำเร็จ"));
    }, [requestId]);

    const color = station ? getColorOption(station.colorId) : null;

    const header = (
        <div className="flex items-center gap-3 border-b bg-card px-4 py-2.5 shrink-0">
            <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => router.push("/stations")}>
                <ArrowLeft className="h-4 w-4" />
                สถานี
            </Button>
            {station && color && (
                <>
                    <span className="text-muted-foreground">/</span>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${color.cls}`}>
                        {station.name}
                    </span>
                </>
            )}
            {template && (
                <>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-sm text-muted-foreground truncate">{template.name}</span>
                </>
            )}
        </div>
    );

    if (loading) {
        return (
            <div className="flex h-full flex-col">
                {header}
                <LoadingSpinner />
            </div>
        );
    }

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
                            <ArrowLeft className="h-4 w-4 mr-1.5" />
                            กลับ
                        </Button>
                        <Button onClick={() => router.push("/stations")} className="gap-2">
                            <Settings2 className="h-4 w-4" />
                            แก้ไขสถานี
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {header}
            <div className="flex-1 overflow-hidden">
                <DesignerCanvas
                    templateName={template.name}
                    initialNodes={template.uiSchema && typeof template.uiSchema === "object" && !Array.isArray(template.uiSchema) && Object.keys(template.uiSchema).length > 0 ? template.uiSchema as Record<string, unknown> : undefined}
                    onSave={async () => {}}
                    saving={false}
                    previewOnly
                    stationId={stationId}
                    initialData={orderData}
                    initialRequestData={requestData}
                />
            </div>
        </div>
    );
}
