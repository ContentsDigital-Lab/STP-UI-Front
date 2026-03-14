"use client";

import { useNode } from "@craftjs/core";
import { ReactNode } from "react";

interface CanvasContainerProps {
    children?: ReactNode;
    className?: string;
}

export function CanvasContainer({ children, className = "" }: CanvasContainerProps) {
    const { connectors: { connect, drag } } = useNode();

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`relative flex flex-wrap gap-4 content-start p-4 rounded-xl border-2 border-dashed border-muted-foreground/20 bg-background ${className}`}
        >
            {children}
            {!children && (
                <div className="w-full flex items-center justify-center py-20 pointer-events-none">
                    <p className="text-sm text-muted-foreground/50">
                        ลากบล็อกจากแถบซ้ายมาวางที่นี่
                    </p>
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
    },
};
