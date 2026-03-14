"use client";

import { useNode } from "@craftjs/core";
import { GripVertical } from "lucide-react";
import { ReactNode } from "react";

interface BaseBlockProps {
    children: ReactNode;
    headerColor: string;   // e.g. "bg-green-500"
    icon: ReactNode;
    title: string;
}

export function BaseBlock({ children, headerColor, icon, title }: BaseBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((state) => ({
        selected: state.events.selected,
    }));

    return (
        <div
            ref={(ref) => { ref && connect(ref); }}
            className={`
                w-full rounded-xl border-2 overflow-hidden
                transition-all shadow-sm
                ${selected
                    ? "border-primary shadow-md ring-2 ring-primary/30"
                    : "border-transparent hover:border-muted-foreground/20 hover:shadow-md"
                }
            `}
        >
            {/* Header — drag handle lives here */}
            <div
                ref={(ref) => { ref && drag(ref); }}
                className={`flex items-center gap-2.5 ${headerColor} px-4 py-2.5 cursor-grab active:cursor-grabbing`}
            >
                <span className="text-white shrink-0">{icon}</span>
                <span className="text-white font-semibold text-sm flex-1">{title}</span>
                <GripVertical className="h-4 w-4 text-white/60 shrink-0" />
            </div>

            {/* Body */}
            <div className="bg-card px-4 py-4">
                {children}
            </div>
        </div>
    );
}

// Reusable field display row inside a block
export function FieldRow({
    label,
    value,
    placeholder = "—",
}: {
    label: string;
    value?: string | number;
    placeholder?: string;
}) {
    const isEmpty = value === undefined || value === "" || value === null;
    return (
        <div className="flex items-start gap-2 text-sm">
            <span className="text-muted-foreground shrink-0 min-w-[120px] text-xs pt-0.5">{label}</span>
            <span className={`font-medium ${isEmpty ? "text-muted-foreground/40 italic" : "text-foreground"}`}>
                {isEmpty ? placeholder : String(value)}
            </span>
        </div>
    );
}
