"use client";

import { useNode } from "@craftjs/core";
import { ReactNode } from "react";
import { usePreview } from "../PreviewContext";

const BG_OPTIONS: Record<string, string> = {
    white:   "bg-white dark:bg-slate-900",
    gray:    "bg-slate-50 dark:bg-slate-800/50",
    blue:    "bg-blue-50 dark:bg-blue-950/30",
    green:   "bg-green-50 dark:bg-green-950/30",
    yellow:  "bg-yellow-50 dark:bg-yellow-950/30",
};

const PAD_OPTIONS: Record<string, string> = {
    none:   "p-0",
    sm:     "p-3",
    md:     "p-5",
    lg:     "p-8",
};

interface SectionProps {
    children?: ReactNode;
    bgColor?: string;
    padding?: string;
}

export function Section({ children, bgColor = "white", padding = "md" }: SectionProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();

    const hasChildren = Array.isArray(children) ? children.some(Boolean) : Boolean(children);

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`
                w-full rounded-xl transition-all
                ${BG_OPTIONS[bgColor] ?? BG_OPTIONS.white}
                ${PAD_OPTIONS[padding] ?? PAD_OPTIONS.md}
                ${isPreview
                    ? ""
                    : `border-2 ${selected ? "border-primary ring-2 ring-primary/20" : "border-slate-200 dark:border-slate-700 hover:border-primary/30"}`
                }
            `}
        >
            {hasChildren ? children : (
                !isPreview && (
                    <div className="flex items-center justify-center py-8 border-2 border-dashed border-muted-foreground/20 rounded-lg">
                        <p className="text-xs text-muted-foreground/50">วาง component ที่นี่</p>
                    </div>
                )
            )}
        </div>
    );
}

Section.craft = {
    displayName: "Section",
    props: { bgColor: "white", padding: "md" } as SectionProps,
    rules: { canMoveIn: () => true },
};
