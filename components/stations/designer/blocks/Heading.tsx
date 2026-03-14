"use client";

import { useNode } from "@craftjs/core";

const SIZE_MAP = { h1: "text-3xl font-bold", h2: "text-2xl font-bold", h3: "text-xl font-semibold", h4: "text-base font-semibold" };
const ALIGN_MAP = { left: "text-left", center: "text-center", right: "text-right" };
const COLOR_MAP: Record<string, string> = {
    default: "text-foreground",
    primary: "text-primary",
    muted:   "text-muted-foreground",
    blue:    "text-blue-600",
    green:   "text-green-600",
};

interface HeadingProps {
    text?: string;
    level?: "h1" | "h2" | "h3" | "h4";
    align?: "left" | "center" | "right";
    color?: string;
}

export function Heading({ text = "หัวข้อ", level = "h2", align = "left", color = "default" }: HeadingProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const Tag = level;
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-lg px-1 py-0.5 cursor-grab transition-all ${selected ? "ring-2 ring-primary/40 bg-primary/5" : "hover:bg-muted/30"}`}
        >
            <Tag className={`${SIZE_MAP[level]} ${ALIGN_MAP[align]} ${COLOR_MAP[color] ?? COLOR_MAP.default}`}>
                {text}
            </Tag>
        </div>
    );
}

Heading.craft = {
    displayName: "Heading",
    props: { text: "หัวข้อ", level: "h2", align: "left", color: "default" } as HeadingProps,
};
