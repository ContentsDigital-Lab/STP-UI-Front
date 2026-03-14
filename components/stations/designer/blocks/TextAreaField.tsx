"use client";

import { useNode } from "@craftjs/core";

interface TextAreaFieldProps {
    label?: string;
    placeholder?: string;
    rows?: number;
}

export function TextAreaField({ label = "หมายเหตุ", placeholder = "กรอกข้อความ...", rows = 3 }: TextAreaFieldProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full rounded-xl border-2 p-3 space-y-1.5 cursor-grab transition-all ${selected ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-700 hover:border-primary/30 bg-card"}`}
        >
            <label className="block text-xs font-semibold text-foreground/70">{label}</label>
            <div
                className="w-full rounded-lg border border-muted bg-background px-3 py-2 text-sm text-muted-foreground/50 pointer-events-none"
                style={{ minHeight: `${rows * 1.75}rem` }}
            >
                {placeholder}
            </div>
        </div>
    );
}

TextAreaField.craft = {
    displayName: "Text Area",
    props: { label: "หมายเหตุ", placeholder: "กรอกข้อความ...", rows: 3 } as TextAreaFieldProps,
};
