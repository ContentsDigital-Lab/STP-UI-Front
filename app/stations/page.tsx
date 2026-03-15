"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    Factory, LayoutTemplate, Play, Settings2,
    CheckCircle2, X, Loader2, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { STATION_CATALOG } from "@/lib/stations/catalog";
import {
    readAssignments, writeAssignment, clearAssignment, AssignmentMap,
} from "@/lib/stations/assignments";
import { getStationTemplates } from "@/lib/api/station-templates";
import { StationTemplate } from "@/lib/types/station-designer";

// ── Template selector modal ───────────────────────────────────────────────────
function TemplateSelectorModal({
    stationId,
    stationLabel,
    currentTemplateId,
    onClose,
    onAssign,
}: {
    stationId:         string;
    stationLabel:      string;
    currentTemplateId: string | undefined;
    onClose:           () => void;
    onAssign:          (stationId: string, templateId: string | null) => void;
}) {
    const [templates, setTemplates] = useState<StationTemplate[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [selected,  setSelected]  = useState<string | null>(currentTemplateId ?? null);

    useEffect(() => {
        getStationTemplates()
            .then((t) => setTemplates(t))
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div
                className="bg-card rounded-2xl border shadow-xl w-full max-w-md space-y-4 p-6"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-semibold">เลือก Template</h2>
                        <p className="text-xs text-muted-foreground mt-0.5">สถานี: {stationLabel}</p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1 rounded text-muted-foreground/40 hover:text-foreground transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* List */}
                {loading ? (
                    <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm">กำลังโหลด...</span>
                    </div>
                ) : templates.length === 0 ? (
                    <div className="text-center py-10">
                        <LayoutTemplate className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">ยังไม่มี template</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">ไปที่ Designer เพื่อสร้าง template ก่อน</p>
                    </div>
                ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                        {templates.map((tmpl) => {
                            const isSelected = selected === tmpl._id;
                            return (
                                <button
                                    key={tmpl._id}
                                    type="button"
                                    onClick={() => setSelected(isSelected ? null : tmpl._id)}
                                    className={`w-full text-left rounded-xl border px-4 py-3 transition-all flex items-center gap-3 ${
                                        isSelected
                                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                                            : "border-border bg-background hover:border-primary/40"
                                    }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{tmpl.name}</p>
                                        {tmpl.description && (
                                            <p className="text-xs text-muted-foreground truncate mt-0.5">{tmpl.description}</p>
                                        )}
                                    </div>
                                    {isSelected && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 justify-between pt-1">
                    {currentTemplateId && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => { onAssign(stationId, null); onClose(); }}
                        >
                            ยกเลิก Template
                        </Button>
                    )}
                    <div className="flex gap-2 ml-auto">
                        <Button variant="outline" size="sm" onClick={onClose}>ยกเลิก</Button>
                        <Button
                            size="sm"
                            disabled={selected === (currentTemplateId ?? null)}
                            onClick={() => { onAssign(stationId, selected); onClose(); }}
                        >
                            ยืนยัน
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StationsPage() {
    const router = useRouter();

    const [assignments,   setAssignments]   = useState<AssignmentMap>({});
    const [templateNames, setTemplateNames] = useState<Record<string, string>>({});
    const [pickerStation, setPickerStation] = useState<string | null>(null);

    const loadData = useCallback(() => {
        const map = readAssignments();
        setAssignments(map);
        if (Object.keys(map).length > 0) {
            getStationTemplates().then((templates) => {
                const names: Record<string, string> = {};
                for (const tmpl of templates) names[tmpl._id] = tmpl.name;
                setTemplateNames(names);
            });
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleAssign = (stationId: string, templateId: string | null) => {
        if (templateId) {
            writeAssignment(stationId, templateId);
        } else {
            clearAssignment(stationId);
        }
        loadData();
    };

    const pickerStationInfo = pickerStation
        ? STATION_CATALOG.find((s) => s.id === pickerStation)
        : null;

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Factory className="h-6 w-6 text-primary" />
                        สถานี
                    </h1>
                    <p className="text-sm text-muted-foreground">สถานีการทำงานในกระบวนการผลิต</p>
                </div>
                <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => router.push("/stations/designer")}
                >
                    <Settings2 className="h-4 w-4" />
                    จัดการ Template
                </Button>
            </div>

            {/* Station grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {STATION_CATALOG.map((station) => {
                    const templateId   = assignments[station.id];
                    const templateName = templateId ? templateNames[templateId] : undefined;

                    return (
                        <div
                            key={station.id}
                            className="rounded-2xl border bg-card p-5 flex flex-col gap-4 hover:shadow-md transition-shadow"
                        >
                            {/* Station identity */}
                            <div>
                                <span className={`text-sm font-semibold px-3 py-1.5 rounded-xl inline-block ${station.color}`}>
                                    {station.label}
                                </span>
                                <p className="text-xs text-muted-foreground mt-2">{station.desc}</p>
                            </div>

                            {/* Template assignment badge */}
                            <div className="flex-1">
                                {templateName ? (
                                    <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5">
                                        <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                                        <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium truncate">{templateName}</span>
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-dashed border-muted-foreground/25 px-3 py-1.5 text-center">
                                        <span className="text-xs text-muted-foreground/50">ยังไม่ได้กำหนด template</span>
                                    </div>
                                )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-1.5">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 h-8 gap-1 text-xs"
                                    onClick={() => setPickerStation(station.id)}
                                >
                                    <LayoutTemplate className="h-3 w-3" />
                                    {templateName ? "เปลี่ยน" : "เลือก Template"}
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-8 px-3 gap-1 text-xs"
                                    disabled={!templateId}
                                    onClick={() => router.push(`/stations/${station.id}`)}
                                >
                                    <Play className="h-3 w-3" />
                                    เข้าสถานี
                                    {templateId && <ChevronRight className="h-3 w-3" />}
                                </Button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Template selector modal */}
            {pickerStation && pickerStationInfo && (
                <TemplateSelectorModal
                    stationId={pickerStation}
                    stationLabel={pickerStationInfo.label}
                    currentTemplateId={assignments[pickerStation]}
                    onClose={() => setPickerStation(null)}
                    onAssign={handleAssign}
                />
            )}
        </div>
    );
}
