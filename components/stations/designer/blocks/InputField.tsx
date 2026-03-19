"use client";

import { useNode } from "@craftjs/core";
import { Hash } from "lucide-react";
import { usePreview } from "../PreviewContext";
import { useStationContext } from "../StationContext";

interface InputFieldProps {
    label?:        string;
    placeholder?:  string;
    fieldType?:    "text" | "number" | "date" | "email" | "tel";
    required?:     boolean;
    // data binding
    fieldKey?:     string;
    defaultValue?: string;
}

export function InputField({
    label = "ชื่อฟิลด์",
    placeholder = "กรอกข้อมูล...",
    fieldType = "text",
    required = false,
    fieldKey = "",
    defaultValue = "",
}: InputFieldProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview = usePreview();
    const { formData, setField } = useStationContext();

    const controlled = !!fieldKey;
    const currentValue = controlled ? String(formData[fieldKey] ?? defaultValue ?? "") : undefined;

    const content = (
        <div className="w-full space-y-1.5">
            {label && <label className="block text-xs font-semibold text-foreground/70">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
            {isPreview && controlled ? (
                <input
                    type={fieldType}
                    placeholder={placeholder}
                    value={currentValue}
                    onChange={(e) => setField(fieldKey, fieldType === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            ) : (
                <input type={fieldType} placeholder={placeholder} defaultValue={defaultValue} className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" readOnly={!isPreview} />
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

InputField.craft = {
    displayName: "Input Field",
    props: {
        label: "ชื่อฟิลด์", placeholder: "กรอกข้อมูล...", fieldType: "text",
        required: false, fieldKey: "", defaultValue: "",
    } as InputFieldProps,
};
