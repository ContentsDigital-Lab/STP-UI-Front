"use client";

import { useNode } from "@craftjs/core";
import { Hash } from "lucide-react";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";

interface TextAreaFieldProps {
    label?:       string;
    placeholder?: string;
    rows?:        number;
    // data binding
    fieldKey?:    string;
}

export function TextAreaField({
    label = "หมายเหตุ",
    placeholder = "กรอกข้อความ...",
    rows = 3,
    fieldKey = "",
}: TextAreaFieldProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { formData, setField } = useStationContext();

    const controlled = !!fieldKey;

    const content = (
        <div className="w-full space-y-1.5">
            {label && <label className="block text-xs font-semibold text-foreground/70">{label}</label>}
            {isPreview && controlled ? (
                <textarea
                    rows={rows}
                    placeholder={placeholder}
                    value={String(formData[fieldKey] ?? "")}
                    onChange={(e) => setField(fieldKey, e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            ) : (
                <textarea rows={rows} placeholder={placeholder} className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40" readOnly={!isPreview} />
            )}
        </div>
    );

    if (isPreview) return content;

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full cursor-grab transition-all rounded-xl p-1 ${selected ? "ring-2 ring-primary/30" : "hover:ring-1 hover:ring-primary/20"}`}
        >
            <div className="pointer-events-none">{content}</div>
        </div>
    );
}

TextAreaField.craft = {
    displayName: "Text Area",
    props: { label: "หมายเหตุ", placeholder: "กรอกข้อความ...", rows: 3, fieldKey: "" } as TextAreaFieldProps,
};
