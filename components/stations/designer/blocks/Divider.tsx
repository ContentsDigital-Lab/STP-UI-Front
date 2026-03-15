"use client";

import { useNode } from "@craftjs/core";

interface DividerProps {
    spacing?: "sm" | "md" | "lg";
    style?: "solid" | "dashed";
}

export function Divider({ spacing = "md", style = "solid" }: DividerProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const padMap = { sm: "py-1", md: "py-3", lg: "py-5" };
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full cursor-grab rounded ${padMap[spacing]} ${selected ? "bg-primary/5" : ""}`}
        >
            <hr className={`border-muted-foreground/20 ${style === "dashed" ? "border-dashed" : "border-solid"}`} />
        </div>
    );
}

Divider.craft = {
    displayName: "Divider",
    props: { spacing: "md", style: "solid" } as DividerProps,
};
