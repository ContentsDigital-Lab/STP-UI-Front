"use client";

import { useEditor } from "@craftjs/core";

// Thai label + field type per block → prop key
const FIELD_META: Record<string, Record<string, { label: string; type: "text" | "number" | "select" | "textarea" | "toggle"; options?: string[] }>> = {
    Section:        { bgColor: { label: "พื้นหลัง", type: "select", options: ["white","gray","blue","green","yellow"] }, padding: { label: "Padding", type: "select", options: ["none","sm","md","lg"] } },
    "2 Columns":    { gap: { label: "ช่องว่าง", type: "select", options: ["2","4","6","8"] } },
    Heading:        { text: { label: "ข้อความ", type: "text" }, level: { label: "ระดับ", type: "select", options: ["h1","h2","h3","h4"] }, align: { label: "การจัดวาง", type: "select", options: ["left","center","right"] }, color: { label: "สี", type: "select", options: ["default","primary","muted","blue","green"] } },
    Paragraph:      { text: { label: "ข้อความ", type: "textarea" }, align: { label: "การจัดวาง", type: "select", options: ["left","center","right"] }, size: { label: "ขนาด", type: "select", options: ["sm","base","lg"] } },
    Divider:        { spacing: { label: "ระยะห่าง", type: "select", options: ["sm","md","lg"] }, style: { label: "รูปแบบ", type: "select", options: ["solid","dashed"] } },
    Spacer:         { height: { label: "ความสูง (px)", type: "number" } },
    Badge:          { text: { label: "ข้อความ", type: "text" }, variant: { label: "รูปแบบ", type: "select", options: ["default","success","warning","danger","info"] } },
    "Input Field":  { label: { label: "Label", type: "text" }, placeholder: { label: "Placeholder", type: "text" }, fieldType: { label: "ประเภท", type: "select", options: ["text","number","date"] } },
    "Select Field": { label: { label: "Label", type: "text" }, options: { label: "ตัวเลือก (คั่นด้วยจุลภาค)", type: "text" }, placeholder: { label: "Placeholder", type: "text" } },
    "Text Area":    { label: { label: "Label", type: "text" }, placeholder: { label: "Placeholder", type: "text" }, rows: { label: "จำนวนแถว", type: "number" } },
    Button:         { label: { label: "ข้อความ", type: "text" }, variant: { label: "รูปแบบ", type: "select", options: ["primary","outline","danger","success"] }, size: { label: "ขนาด", type: "select", options: ["sm","md","lg"] } },
    "Info Card":    { title: { label: "ชื่อ", type: "text" }, subtitle: { label: "หัวข้อรอง", type: "text" }, content: { label: "เนื้อหา", type: "textarea" }, accentColor: { label: "สีขอบ", type: "select", options: ["blue","green","orange","purple","red","slate"] } },
    Status:         { label: { label: "Label", type: "text" }, status: { label: "สถานะ", type: "select", options: ["pending","in_progress","completed","error"] } },
};

function Field({
    label, value, fieldMeta, onChange,
}: {
    label: string;
    value: unknown;
    fieldMeta: { type: "text" | "number" | "select" | "textarea" | "toggle"; options?: string[] };
    onChange: (v: string | number | boolean) => void;
}) {
    const base = "w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition";

    return (
        <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">{label}</label>
            {fieldMeta.type === "select" ? (
                <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={base}>
                    {(fieldMeta.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : fieldMeta.type === "textarea" ? (
                <textarea rows={3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={`${base} resize-none`} />
            ) : fieldMeta.type === "number" ? (
                <input type="number" value={String(value ?? "")} onChange={(e) => onChange(Number(e.target.value))} className={base} />
            ) : (
                <input type="text" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={base} />
            )}
        </div>
    );
}

export function PropertiesPanel() {
    const { selected, nodes, actions } = useEditor((state) => ({
        selected: [...state.events.selected][0] ?? null,
        nodes: state.nodes,
    }));

    if (!selected) {
        return (
            <aside className="w-64 shrink-0 border-l bg-card flex flex-col">
                <div className="px-4 py-3 border-b">
                    <h2 className="text-sm font-semibold">Properties</h2>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                        คลิก component บน Canvas<br />เพื่อแก้ไข properties
                    </p>
                </div>
            </aside>
        );
    }

    const node      = nodes[selected];
    const props     = (node?.data?.props ?? {}) as Record<string, unknown>;
    const blockName = node?.data?.displayName ?? node?.data?.name ?? "";
    const fieldMeta = FIELD_META[blockName] ?? {};

    const setProp = (key: string, value: string | number | boolean) => {
        actions.setProp(selected, (p: Record<string, unknown>) => { p[key] = value; });
    };

    const keys = Object.keys(props).filter((k) => k !== "children");

    return (
        <aside className="w-64 shrink-0 border-l bg-card flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b shrink-0">
                <h2 className="text-sm font-semibold">Properties</h2>
            </div>
            <div className="p-4 space-y-4">
                <div className="rounded-lg bg-muted/40 px-3 py-2">
                    <p className="text-xs font-bold text-foreground">{blockName || "Component"}</p>
                    <p className="text-[11px] text-muted-foreground">ID: {selected.slice(0, 8)}</p>
                </div>

                {keys.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">ไม่มี properties</p>
                ) : (
                    keys.map((key) => {
                        const meta = fieldMeta[key] ?? { label: key, type: "text" as const };
                        return (
                            <Field
                                key={key}
                                label={meta.label}
                                value={props[key]}
                                fieldMeta={meta}
                                onChange={(v) => setProp(key, v)}
                            />
                        );
                    })
                )}
            </div>
        </aside>
    );
}
