"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, LayoutTemplate, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getStationTemplate } from "@/lib/api/station-templates";
import { StationTemplate } from "@/lib/types/station-designer";
import { getStations, getColorOption, StationEntity } from "@/lib/stations/stations-store";

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
    const params    = useParams();
    const router    = useRouter();
    const stationId = params.stationId as string;

    const [station,    setStation]    = useState<StationEntity | null>(null);
    const [template,   setTemplate]   = useState<StationTemplate | null>(null);
    const [loading,    setLoading]    = useState(true);
    const [noTemplate, setNoTemplate] = useState(false);

    useEffect(() => {
        const stations  = getStations();
        const found     = stations.find((s) => s._id === stationId) ?? null;
        setStation(found);

        if (!found?.templateId) {
            setNoTemplate(true);
            setLoading(false);
            return;
        }

        getStationTemplate(found.templateId)
            .then((t) => {
                if (t) setTemplate(t);
                else { toast.error("โหลด template ไม่สำเร็จ"); setNoTemplate(true); }
            })
            .catch(() => { toast.error("เชื่อมต่อ API ไม่ได้"); setNoTemplate(true); })
            .finally(() => setLoading(false));
    }, [stationId]);

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
                    initialNodes={Object.keys(template.craftNodes ?? {}).length > 0 ? template.craftNodes : undefined}
                    onSave={async () => {}}
                    saving={false}
                    previewOnly
                />
            </div>
        </div>
    );
}
