"use client";

import { useNode } from "@craftjs/core";
import { Database } from "lucide-react";
import { usePreview } from "../PreviewContext";

// ── Status config ─────────────────────────────────────────────────────────────
export const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string; border: string }> = {
    pending:     { label: "รอดำเนินการ",    dot: "bg-slate-400",  bg: "bg-slate-100 dark:bg-slate-800",   text: "text-slate-600 dark:text-slate-300",  border: "border-slate-300" },
    in_progress: { label: "กำลังดำเนินการ", dot: "bg-blue-500",   bg: "bg-blue-50 dark:bg-blue-950/40",   text: "text-blue-700 dark:text-blue-300",    border: "border-blue-300"  },
    completed:   { label: "เสร็จแล้ว",      dot: "bg-green-500",  bg: "bg-green-50 dark:bg-green-950/40", text: "text-green-700 dark:text-green-300",  border: "border-green-300" },
    error:       { label: "มีปัญหา",        dot: "bg-red-500",    bg: "bg-red-50 dark:bg-red-950/40",     text: "text-red-700 dark:text-red-300",      border: "border-red-300"   },
    cancelled:   { label: "ยกเลิก",         dot: "bg-orange-400", bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-300", border: "border-orange-300" },
};

const SAMPLE_LIST = [
    { id: "001", name: "ออเดอร์กระจกใส 3mm", status: "in_progress" },
    { id: "002", name: "กระจกลามิเนต 6mm",   status: "pending"     },
    { id: "003", name: "กระจกเทมเปอร์ 10mm", status: "completed"   },
    { id: "004", name: "กระจกสีชา 5mm",      status: "error"       },
];

// ── Style renderers ────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} animate-pulse`} />
            {cfg.label}
        </span>
    );
}

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
    return (
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}

function StatusDot({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
            <span className={`h-2 w-2 rounded-full ${cfg.dot} animate-pulse`} />
            {cfg.label}
        </span>
    );
}

function StatusTag({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded border-l-2 pl-2 pr-3 py-0.5 text-xs font-medium bg-muted/30 ${cfg.text} border-l-${cfg.dot.replace("bg-", "")}`}
            style={{ borderLeftColor: undefined }}
        >
            <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}

function renderStatus(style: string, status: string) {
    if (style === "badge") return <StatusBadge status={status} />;
    if (style === "dot")   return <StatusDot status={status} />;
    if (style === "tag")   return <StatusTag status={status} />;
    return <StatusPill status={status} />;
}

// ── Props interface ────────────────────────────────────────────────────────────
interface StatusIndicatorProps {
    label?:        string;
    displayStyle?: "pill" | "badge" | "dot" | "tag";
    displayMode?:  "single" | "list";
    dataVar?:      string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function StatusIndicator({
    label        = "สถานะงาน",
    displayStyle = "pill",
    displayMode  = "single",
    dataVar      = "",
}: StatusIndicatorProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();

    // ── Preview render ─────────────────────────────────────────────────────────
    if (isPreview) {
        if (displayMode === "list") {
            return (
                <div className="w-full rounded-xl border bg-card overflow-hidden">
                    {label && <div className="px-4 py-2 border-b bg-muted/30"><p className="text-xs font-semibold text-muted-foreground">{label}</p></div>}
                    <div className="divide-y">
                        {SAMPLE_LIST.map((row) => (
                            <div key={row.id} className="flex items-center justify-between px-4 py-2.5">
                                <div>
                                    <p className="text-sm font-medium text-foreground">{row.name}</p>
                                    <p className="text-[11px] text-muted-foreground">#{row.id}</p>
                                </div>
                                {renderStatus(displayStyle, row.status)}
                            </div>
                        ))}
                    </div>
                    {dataVar && (
                        <div className="px-4 py-1.5 border-t bg-blue-50/40 dark:bg-blue-950/20">
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">{`{${dataVar}}`} — แสดงข้อมูลจริงเมื่อใช้งาน</p>
                        </div>
                    )}
                </div>
            );
        }
        return (
            <div className="w-full rounded-xl border bg-card p-4 space-y-2">
                {label && <p className="text-xs font-semibold text-muted-foreground">{label}</p>}
                {renderStatus(displayStyle, "in_progress")}
                {dataVar && <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">{`{${dataVar}}`}</p>}
            </div>
        );
    }

    // ── Design mode render ─────────────────────────────────────────────────────
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 cursor-grab transition-all ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                {dataVar && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-mono">
                        <Database className="h-2.5 w-2.5" />{`{${dataVar}}`}
                    </span>
                )}
            </div>

            {/* Style preview */}
            {displayMode === "list" ? (
                <div className="border-t divide-y">
                    {(["pending","in_progress","completed","error"] as const).slice(0, 3).map((s) => (
                        <div key={s} className="flex items-center justify-between px-4 py-2">
                            <span className="text-xs text-muted-foreground/60 font-mono">item...</span>
                            {renderStatus(displayStyle, s)}
                        </div>
                    ))}
                    <div className="px-4 py-1.5 text-[10px] text-muted-foreground/40 italic">
                        {dataVar ? `แสดงข้อมูลจาก {${dataVar}}` : "ตัวอย่างรายการ"}
                    </div>
                </div>
            ) : (
                <div className="px-4 pb-3">
                    <div className="flex flex-wrap gap-1.5">
                        {(["pending","in_progress","completed","error"] as const).map((s) => (
                            <div key={s} className="opacity-60">{renderStatus(displayStyle, s)}</div>
                        ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground/40 mt-1.5 italic">
                        {dataVar ? `แสดงสถานะจาก {${dataVar}}` : "ตัวอย่างรูปแบบสถานะ"}
                    </p>
                </div>
            )}
        </div>
    );
}

StatusIndicator.craft = {
    displayName: "Status",
    props: {
        label: "สถานะงาน", displayStyle: "pill", displayMode: "single", dataVar: "",
    } as StatusIndicatorProps,
};
