"use client";

import { useNode } from "@craftjs/core";
import { ReactNode } from "react";

interface TwoColumnsProps {
    children?: ReactNode;
    gap?: string;
}

export function TwoColumns({ children, gap = "4" }: TwoColumnsProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`
                w-full grid grid-cols-2 gap-${gap} transition-all
                ${selected ? "outline outline-2 outline-primary/40 rounded-lg" : ""}
            `}
        >
            {children}
        </div>
    );
}

TwoColumns.craft = {
    displayName: "2 Columns",
    props: { gap: "4" } as TwoColumnsProps,
    rules: { canMoveIn: () => false },
};
