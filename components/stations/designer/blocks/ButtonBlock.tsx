"use client";

import { useNode } from "@craftjs/core";

const VARIANT_MAP: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border-2 border-primary text-primary bg-transparent hover:bg-primary/10",
    danger:  "bg-red-600 text-white hover:bg-red-700",
    success: "bg-green-600 text-white hover:bg-green-700",
};

const SIZE_MAP = { sm: "px-3 py-1.5 text-xs", md: "px-5 py-2 text-sm", lg: "px-7 py-3 text-base" };

interface ButtonBlockProps {
    label?: string;
    variant?: "primary" | "outline" | "danger" | "success";
    size?: "sm" | "md" | "lg";
    fullWidth?: boolean;
}

export function ButtonBlock({ label = "ปุ่มกด", variant = "primary", size = "md", fullWidth = false }: ButtonBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`cursor-grab rounded-xl p-1 transition-all ${selected ? "ring-2 ring-primary/40 bg-primary/5" : "hover:bg-muted/20"} ${fullWidth ? "w-full" : "inline-flex"}`}
        >
            <button
                className={`rounded-lg font-semibold transition-colors pointer-events-none ${VARIANT_MAP[variant] ?? VARIANT_MAP.primary} ${SIZE_MAP[size]} ${fullWidth ? "w-full" : ""}`}
            >
                {label}
            </button>
        </div>
    );
}

ButtonBlock.craft = {
    displayName: "Button",
    props: { label: "ปุ่มกด", variant: "primary", size: "md", fullWidth: false } as ButtonBlockProps,
};
