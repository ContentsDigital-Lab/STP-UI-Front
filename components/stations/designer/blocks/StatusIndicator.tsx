"use client";

import { useNode } from "@craftjs/core";

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
    pending:     { label: "รอดำเนินการ",  dot: "bg-slate-400",  bg: "bg-slate-100 dark:bg-slate-800",   text: "text-slate-600 dark:text-slate-300" },
    in_progress: { label: "กำลังดำเนินการ", dot: "bg-blue-500",  bg: "bg-blue-50 dark:bg-blue-950/40",   text: "text-blue-700 dark:text-blue-300" },
    completed:   { label: "เสร็จแล้ว",     dot: "bg-green-500", bg: "bg-green-50 dark:bg-green-950/40", text: "text-green-700 dark:text-green-300" },
    error:       { label: "มีปัญหา",       dot: "bg-red-500",   bg: "bg-red-50 dark:bg-red-950/40",     text: "text-red-700 dark:text-red-300" },
};

interface StatusIndicatorProps {
    label?: string;
    status?: "pending" | "in_progress" | "completed" | "error";
}

export function StatusIndicator({ label = "สถานะงาน", status = "pending" }: StatusIndicatorProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 p-4 cursor-grab transition-all ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`}
        >
            <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${cfg.bg}`}>
                <span className={`h-2 w-2 rounded-full ${cfg.dot} animate-pulse`} />
                <span className={`text-sm font-medium ${cfg.text}`}>{cfg.label}</span>
            </div>
        </div>
    );
}

StatusIndicator.craft = {
    displayName: "Status",
    props: { label: "สถานะงาน", status: "pending" } as StatusIndicatorProps,
};
