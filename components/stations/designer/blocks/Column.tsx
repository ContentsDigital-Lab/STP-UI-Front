"use client";

import { useNode } from "@craftjs/core";
import { ReactNode } from "react";
import { usePreview } from "../PreviewContext";

interface ColumnProps {
    children?: ReactNode;
}

export function Column({ children }: ColumnProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();

    const hasChildren = Array.isArray(children) ? children.some(Boolean) : Boolean(children);

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`
                flex flex-col gap-3 min-h-[80px] p-3 rounded-lg transition-all
                ${isPreview
                    ? ""
                    : `border-2 border-dashed ${selected ? "border-primary/60 bg-primary/5" : "border-muted-foreground/20 hover:border-muted-foreground/40"}`
                }
            `}
        >
            {hasChildren ? children : (
                !isPreview && (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-[11px] text-muted-foreground/40">วางที่นี่</p>
                    </div>
                )
            )}
        </div>
    );
}

Column.craft = {
    displayName: "Column",
    rules: { canMoveIn: () => true },
};
