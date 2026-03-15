"use client";

import { useNode } from "@craftjs/core";
import { usePreview } from "../PreviewContext";

interface SpacerProps { height?: number; }

export function Spacer({ height = 24 }: SpacerProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            style={{ height: `${height}px` }}
            className={`w-full rounded transition-all ${isPreview ? "" : `cursor-grab ${selected ? "bg-primary/10 border border-dashed border-primary/40" : "hover:bg-muted/20"}`}`}
        />
    );
}

Spacer.craft = {
    displayName: "Spacer",
    props: { height: 24 } as SpacerProps,
};
