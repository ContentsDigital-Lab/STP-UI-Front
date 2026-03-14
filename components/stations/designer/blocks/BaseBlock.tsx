"use client";

import { useNode } from "@craftjs/core";
import { ReactNode } from "react";

interface BaseBlockProps {
    children?: ReactNode;
    color: string;        // Tailwind bg class e.g. "bg-green-500"
    borderColor: string;  // e.g. "border-green-300"
    bgLight: string;      // e.g. "bg-green-50 dark:bg-green-950/30"
    icon: ReactNode;
    title: string;
}

export function BaseBlock({ children, color, borderColor, bgLight, icon, title }: BaseBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((state) => ({
        selected: state.events.selected,
    }));

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`
                relative rounded-xl border-2 ${borderColor} ${bgLight}
                min-w-[180px] max-w-[240px] cursor-grab active:cursor-grabbing
                shadow-sm transition-all select-none
                ${selected ? "ring-2 ring-primary ring-offset-2 shadow-md" : "hover:shadow-md"}
            `}
        >
            {/* Header bar */}
            <div className={`flex items-center gap-2 ${color} rounded-t-[10px] px-3 py-2`}>
                <span className="text-white">{icon}</span>
                <span className="text-white text-xs font-semibold truncate">{title}</span>
            </div>
            {/* Body */}
            <div className="px-3 py-2.5 space-y-1.5 text-xs text-foreground/80">
                {children}
            </div>
        </div>
    );
}

// Small field row used inside blocks
export function BlockField({ label, value }: { label: string; value?: string | number }) {
    if (value === undefined || value === "") return null;
    return (
        <div className="flex items-start gap-1">
            <span className="text-muted-foreground shrink-0">{label}:</span>
            <span className="font-medium truncate">{String(value)}</span>
        </div>
    );
}
