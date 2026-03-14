"use client";

import { useEditor } from "@craftjs/core";

// Thai label map per block type → prop key
const LABEL_MAP: Record<string, Record<string, string>> = {
    "รับวัตถุดิบ":     { label: "ชื่อขั้นตอน",   materialType: "ประเภทวัสดุ",    quantity: "จำนวน" },
    "ตัดกระจก":       { label: "ชื่อขั้นตอน",   cutType: "ประเภทการตัด",        estimatedTime: "เวลา (นาที)" },
    "เจียระไนขอบ":    { label: "ชื่อขั้นตอน",   grindType: "ประเภทการเจีย",     edgeFinish: "ผิวขอบ" },
    "แปรรูป":         { label: "ชื่อขั้นตอน",   processName: "ชื่อกระบวนการ",   estimatedTime: "เวลา (นาที)" },
    "ตรวจสอบคุณภาพ": { label: "ชื่อขั้นตอน",   checkPoints: "จุดตรวจสอบ",      passCriteria: "เกณฑ์ผ่าน" },
    "บรรจุ/จัดเตรียม":{ label: "ชื่อขั้นตอน",  packType: "ประเภทบรรจุ",        quantity: "จำนวน" },
    "ส่งออก/ส่งมอบ":  { label: "ชื่อขั้นตอน",   destination: "ปลายทาง" },
    "หมายเหตุ":       { content: "เนื้อหา" },
    "Canvas":         { className: "CSS Class" },
};

function PropField({
    label, value, onChange, multiline = false,
}: {
    label: string;
    value: string | number | undefined;
    onChange: (v: string) => void;
    multiline?: boolean;
}) {
    const cls = "w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition";
    return (
        <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                {label}
            </label>
            {multiline ? (
                <textarea
                    rows={3}
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                    className={`${cls} resize-none`}
                />
            ) : (
                <input
                    type="text"
                    value={value ?? ""}
                    onChange={(e) => onChange(e.target.value)}
                    className={cls}
                />
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
            <aside className="w-60 shrink-0 border-l bg-card flex flex-col">
                <div className="px-4 py-3 border-b">
                    <h2 className="text-sm font-semibold">Properties</h2>
                </div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <p className="text-xs text-muted-foreground text-center leading-relaxed">
                        คลิกเลือก block<br />เพื่อแก้ไข properties
                    </p>
                </div>
            </aside>
        );
    }

    const node       = nodes[selected];
    const props      = (node?.data?.props ?? {}) as Record<string, unknown>;
    const blockName  = node?.data?.displayName ?? node?.data?.name ?? "";
    const labelMap   = LABEL_MAP[blockName] ?? {};

    const setProp = (key: string, value: string) => {
        const isNumber = typeof props[key] === "number";
        actions.setProp(selected, (p: Record<string, unknown>) => {
            p[key] = isNumber ? Number(value) : value;
        });
    };

    const fields = Object.keys(props).map((key) => {
        const thaiLabel = labelMap[key] ?? key;
        const val = props[key];
        const isLong = key === "content" || key === "checkPoints" || key === "passCriteria";
        return (
            <PropField
                key={key}
                label={thaiLabel}
                value={val as string | number | undefined}
                onChange={(v) => setProp(key, v)}
                multiline={isLong}
            />
        );
    });

    return (
        <aside className="w-60 shrink-0 border-l bg-card flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b">
                <h2 className="text-sm font-semibold">Properties</h2>
            </div>
            <div className="p-4 space-y-4">
                <div className="rounded-lg bg-muted/30 px-3 py-2">
                    <p className="text-xs font-semibold text-foreground">{blockName || "Block"}</p>
                    <p className="text-[11px] text-muted-foreground">แก้ไขค่าตรงนี้</p>
                </div>
                {fields}
            </div>
        </aside>
    );
}
