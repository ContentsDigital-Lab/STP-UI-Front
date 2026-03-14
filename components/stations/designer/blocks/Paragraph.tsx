"use client";

import { useNode } from "@craftjs/core";

const SIZE_MAP = { sm: "text-xs", base: "text-sm", lg: "text-base" };
const ALIGN_MAP = { left: "text-left", center: "text-center", right: "text-right" };

interface ParagraphProps {
    text?: string;
    align?: "left" | "center" | "right";
    size?: "sm" | "base" | "lg";
}

export function Paragraph({ text = "ข้อความ...", align = "left", size = "base" }: ParagraphProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-lg px-1 py-0.5 cursor-grab transition-all ${selected ? "ring-2 ring-primary/40 bg-primary/5" : "hover:bg-muted/30"}`}
        >
            <p className={`${SIZE_MAP[size]} ${ALIGN_MAP[align]} text-foreground/80 leading-relaxed whitespace-pre-wrap`}>{text}</p>
        </div>
    );
}

Paragraph.craft = {
    displayName: "Paragraph",
    props: { text: "ข้อความ...", align: "left", size: "base" } as ParagraphProps,
};
