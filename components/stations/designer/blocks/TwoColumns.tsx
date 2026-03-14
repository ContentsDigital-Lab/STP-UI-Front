"use client";

import { useNode, Element } from "@craftjs/core";
import { ReactNode } from "react";
import { Column } from "./Column";

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
            {children ?? (
                <>
                    <Element is={Column} canvas id="col-left" />
                    <Element is={Column} canvas id="col-right" />
                </>
            )}
        </div>
    );
}

TwoColumns.craft = {
    displayName: "2 Columns",
    props: { gap: "4" } as TwoColumnsProps,
    rules: { canMoveIn: () => false },
};
