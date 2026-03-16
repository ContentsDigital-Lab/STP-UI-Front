"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getStationTemplate, updateStationTemplate } from "@/lib/api/station-templates";
import { StationTemplate } from "@/lib/types/station-designer";

// ⚠️ Craft.js uses browser APIs — must disable SSR
const DesignerCanvas = dynamic(
    () => import("@/components/stations/designer/DesignerCanvas").then((m) => m.DesignerCanvas),
    { ssr: false, loading: () => <CanvasLoading /> },
);

function CanvasLoading() {
    return (
        <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-2">
                <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">กำลังโหลด Designer...</p>
            </div>
        </div>
    );
}

export default function StationDesignerEditorPage() {
    const params = useParams();
    const router = useRouter();
    const id     = params.id as string;

    const [template, setTemplate] = useState<StationTemplate | null>(null);
    const [loading,  setLoading]  = useState(true);
    const [saving,   setSaving]   = useState(false);

    useEffect(() => {
        if (!id) return;
        getStationTemplate(id)
            .then((t) => { setTemplate(t); setLoading(false); })
            .catch(() => { toast.error("โหลด template ไม่สำเร็จ"); setLoading(false); });
    }, [id]);

    const handleSave = async (craftNodes: Record<string, unknown>) => {
        if (!template) return;
        setSaving(true);
        try {
            const updated = await updateStationTemplate(id, { uiSchema: craftNodes });
            if (updated) setTemplate(updated);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "unknown error";
            console.error("[handleSave] FAILED:", err);
            toast.error("บันทึกไม่สำเร็จ — " + msg, { duration: 8000 });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <CanvasLoading />
            </div>
        );
    }

    if (!template) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4">
                <p className="text-muted-foreground">ไม่พบ template</p>
                <Button variant="outline" onClick={() => router.push("/stations/designer")}>
                    กลับไปหน้า Gallery
                </Button>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col">
            {/* Back nav */}
            <div className="flex items-center gap-2 border-b bg-card px-4 py-2 shrink-0">
                <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => router.push("/stations/designer")}>
                    <ArrowLeft className="h-4 w-4" />
                    Gallery
                </Button>
                <span className="text-muted-foreground">/</span>
                <span className="text-sm font-medium truncate">{template.name}</span>
            </div>

            {/* Full-height canvas */}
            <div className="flex-1 overflow-hidden">
                <DesignerCanvas
                    templateName={template.name}
                    initialNodes={template.uiSchema && typeof template.uiSchema === "object" && !Array.isArray(template.uiSchema) && Object.keys(template.uiSchema).length > 0 ? template.uiSchema as Record<string, unknown> : undefined}
                    onSave={handleSave}
                    saving={saving}
                />
            </div>
        </div>
    );
}
