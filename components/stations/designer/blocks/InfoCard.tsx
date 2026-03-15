"use client";

import { useNode } from "@craftjs/core";

const ACCENT_MAP: Record<string, string> = {
    blue:   "border-l-blue-500",
    green:  "border-l-green-500",
    orange: "border-l-orange-500",
    purple: "border-l-purple-500",
    red:    "border-l-red-500",
    slate:  "border-l-slate-400",
};

interface InfoCardProps {
    title?: string;
    subtitle?: string;
    content?: string;
    accentColor?: string;
}

export function InfoCard({ title = "ชื่อการ์ด", subtitle = "หัวข้อรอง", content = "รายละเอียด...", accentColor = "blue" }: InfoCardProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`
                w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-card
                border-l-4 ${ACCENT_MAP[accentColor] ?? ACCENT_MAP.blue}
                p-4 space-y-1.5 cursor-grab transition-all shadow-sm
                ${selected ? "ring-2 ring-primary/30 shadow-md" : "hover:shadow-md"}
            `}
        >
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {content && <p className="text-xs text-foreground/70 leading-relaxed mt-2">{content}</p>}
        </div>
    );
}

InfoCard.craft = {
    displayName: "Info Card",
    props: { title: "ชื่อการ์ด", subtitle: "หัวข้อรอง", content: "รายละเอียด...", accentColor: "blue" } as InfoCardProps,
};
