"use client";

import { useNode } from "@craftjs/core";

const VARIANT_MAP: Record<string, string> = {
    default: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    success: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    danger:  "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
    info:    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
};

interface BadgeProps {
    text?: string;
    variant?: "default" | "success" | "warning" | "danger" | "info";
}

export function Badge({ text = "Status", variant = "default" }: BadgeProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`inline-flex cursor-grab rounded-lg ${selected ? "ring-2 ring-primary/40" : ""}`}
        >
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${VARIANT_MAP[variant] ?? VARIANT_MAP.default}`}>
                {text}
            </span>
        </div>
    );
}

Badge.craft = {
    displayName: "Badge",
    props: { text: "Status", variant: "default" } as BadgeProps,
};
