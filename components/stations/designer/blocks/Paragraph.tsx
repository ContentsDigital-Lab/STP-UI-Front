"use client";

import { useNode } from "@craftjs/core";
import { Database } from "lucide-react";

const SIZE_MAP  = { sm: "text-xs", base: "text-sm", lg: "text-base" };
const ALIGN_MAP = { left: "text-left", center: "text-center", right: "text-right" };

interface ParagraphProps {
    text?:    string;
    align?:   "left" | "center" | "right";
    size?:    "sm" | "base" | "lg";
    dataVar?: string;
}

export function Paragraph({ text = "ข้อความ...", align = "left", size = "base", dataVar = "" }: ParagraphProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-lg px-1 py-0.5 cursor-grab transition-all ${selected ? "ring-2 ring-primary/40 bg-primary/5" : "hover:bg-muted/30"}`}
        >
            {dataVar && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-mono mb-0.5">
                    <Database className="h-2.5 w-2.5" />{`{${dataVar}}`}
                </span>
            )}
            <p className={`${SIZE_MAP[size]} ${ALIGN_MAP[align]} text-foreground/80 leading-relaxed whitespace-pre-wrap ${dataVar ? "opacity-50 italic" : ""}`}>
                {text}
            </p>
        </div>
    );
}

Paragraph.craft = {
    displayName: "Paragraph",
    props: { text: "ข้อความ...", align: "left", size: "base", dataVar: "" } as ParagraphProps,
};
