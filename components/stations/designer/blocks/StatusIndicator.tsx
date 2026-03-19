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

    const content = displayMode === "list" ? (
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
    ) : (
        <div className="w-full rounded-xl border bg-card p-4 space-y-2">
            {label && <p className="text-xs font-semibold text-muted-foreground">{label}</p>}
            {renderStatus(displayStyle, "in_progress")}
            {dataVar && <p className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">{`{${dataVar}}`}</p>}
        </div>
    );

    if (isPreview) return content;

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full cursor-grab transition-all rounded-xl ${selected ? "ring-2 ring-primary/30" : "hover:ring-1 hover:ring-primary/20"}`}
        >
            {content}
        </div>
    );
}

StatusIndicator.craft = {
    displayName: "Status",
    props: {
        label: "สถานะงาน", displayStyle: "pill", displayMode: "single", dataVar: "",
    } as StatusIndicatorProps,
};
