"use client";

import { useNode } from "@craftjs/core";
import { ReactNode } from "react";

type WidthRatio = "equal" | "2/3-1/3" | "1/3-2/3" | "3/4-1/4" | "1/4-3/4";

interface TwoColumnsProps {
    children?:   ReactNode;
    gap?:        string;
    columns?:    number | string;   // string because Craft.js select returns strings
    widthRatio?: WidthRatio;
}

/** Return a CSS gridTemplateColumns string based on count + ratio */
function gridTemplate(columns: number, widthRatio: WidthRatio): string {
    if (columns === 3) return "1fr 1fr 1fr";
    if (columns === 4) return "1fr 1fr 1fr 1fr";
    // columns === 2
    const MAP: Record<WidthRatio, string> = {
        "equal":   "1fr 1fr",
        "2/3-1/3": "2fr 1fr",
        "1/3-2/3": "1fr 2fr",
        "3/4-1/4": "3fr 1fr",
        "1/4-3/4": "1fr 3fr",
    };
    return MAP[widthRatio] ?? "1fr 1fr";
}

export function TwoColumns({
    children,
    gap        = "4",
    columns    = 2,
    widthRatio = "equal",
}: TwoColumnsProps) {
    const colNum = Number(columns) || 2;
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            style={{ gridTemplateColumns: gridTemplate(colNum, widthRatio) }}
            className={`
                w-full grid gap-${gap} transition-all
                ${selected ? "outline outline-2 outline-primary/40 rounded-lg" : ""}
            `}
        >
            {children}
        </div>
    );
}

TwoColumns.craft = {
    displayName: "2 Columns",
    props: { gap: "4", columns: 2, widthRatio: "equal" } as TwoColumnsProps,
    rules: { canMoveIn: () => false },
};
