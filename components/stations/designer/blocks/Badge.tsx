"use client";

import { useNode } from "@craftjs/core";
import { Database } from "lucide-react";
import { usePreview } from "../PreviewContext";

const VARIANT_MAP: Record<string, string> = {
    default: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    success: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    danger:  "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    info:    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
};

interface BadgeProps {
    text?:    string;
    variant?: "default" | "success" | "warning" | "danger" | "info";
    dataVar?: string;
}

export function Badge({ text = "Status", variant = "default", dataVar = "" }: BadgeProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`inline-flex flex-col gap-0.5 rounded-lg ${isPreview ? "" : `cursor-grab ${selected ? "ring-2 ring-primary/40" : ""}`}`}
        >
            {dataVar && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-mono">
                    <Database className="h-2.5 w-2.5" />{`{${dataVar}}`}
                </span>
            )}
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${VARIANT_MAP[variant] ?? VARIANT_MAP.default} ${dataVar ? "opacity-50" : ""}`}>
                {text}
            </span>
        </div>
    );
}

Badge.craft = {
    displayName: "Badge",
    props: { text: "Status", variant: "default", dataVar: "" } as BadgeProps,
};
