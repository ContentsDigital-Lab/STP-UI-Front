"use client";

import { useNode } from "@craftjs/core";
import { ReactNode } from "react";
import { usePreview } from "./PreviewContext";

interface CanvasContainerProps {
    children?: ReactNode;
    className?: string;
}

export function CanvasContainer({ children, className = "" }: CanvasContainerProps) {
    const { connectors: { connect, drag }, selected } = useNode((state) => ({
        selected: state.events.selected,
    }));
    const isPreview = usePreview();

    const hasChildren = Array.isArray(children)
        ? children.some(Boolean)
        : Boolean(children);

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`
                relative flex flex-col gap-3
                min-h-[500px] w-full p-5
                ${isPreview
                    ? "bg-background"
                    : `rounded-xl border-2 border-dashed ${selected ? "border-primary/40 bg-primary/5" : "border-muted-foreground/20 bg-background"}`
                }
                transition-colors
                ${className}
            `}
        >
            {hasChildren ? children : (
                <div className="flex-1 flex flex-col items-center justify-center py-24 pointer-events-none space-y-2">
                    <div className="w-12 h-12 rounded-xl border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                        <span className="text-2xl text-muted-foreground/30">+</span>
                    </div>
                    <p className="text-sm text-muted-foreground/50">ลากบล็อกจากแถบซ้ายมาวางที่นี่</p>
                </div>
            )}
        </div>
    );
}

CanvasContainer.craft = {
    displayName: "Canvas",
    rules: {
        canMoveIn: () => true,
        canMoveOut: () => true,
        canDrag: () => false,
    },
};
