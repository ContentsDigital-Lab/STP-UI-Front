"use client";

import { useEditor } from "@craftjs/core";
import { Database, Zap, Settings2 } from "lucide-react";

// ── Field metadata with sections ─────────────────────────────────────────────
type Section  = "props" | "data" | "action";
type FieldDef = {
    label:    string;
    type:     "text" | "number" | "select" | "textarea" | "toggle";
    options?: string[];
    section:  Section;
};

const FIELD_META: Record<string, Record<string, FieldDef>> = {
    Section: {
        bgColor: { label: "พื้นหลัง", type: "select", section: "props", options: ["white","gray","blue","green","yellow"] },
        padding: { label: "Padding",  type: "select", section: "props", options: ["none","sm","md","lg"] },
    },
    "2 Columns": {
        gap: { label: "ช่องว่าง", type: "select", section: "props", options: ["2","4","6","8"] },
    },
    Heading: {
        text:    { label: "ข้อความ",   type: "text",   section: "props" },
        level:   { label: "ระดับ",     type: "select", section: "props", options: ["h1","h2","h3","h4"] },
        align:   { label: "จัดวาง",    type: "select", section: "props", options: ["left","center","right"] },
        color:   { label: "สี",        type: "select", section: "props", options: ["default","primary","muted","blue","green"] },
        dataVar: { label: "ตัวแปรข้อมูล (แทนข้อความ)", type: "text", section: "data" },
    },
    Paragraph: {
        text:    { label: "ข้อความ",   type: "textarea", section: "props" },
        align:   { label: "จัดวาง",    type: "select",   section: "props", options: ["left","center","right"] },
        size:    { label: "ขนาด",      type: "select",   section: "props", options: ["sm","base","lg"] },
        dataVar: { label: "ตัวแปรข้อมูล (แทนข้อความ)", type: "text", section: "data" },
    },
    Divider: {
        spacing: { label: "ระยะห่าง", type: "select", section: "props", options: ["sm","md","lg"] },
        style:   { label: "รูปแบบ",   type: "select", section: "props", options: ["solid","dashed"] },
    },
    Spacer: {
        height: { label: "ความสูง (px)", type: "number", section: "props" },
    },
    Badge: {
        text:    { label: "ข้อความ", type: "text",   section: "props" },
        variant: { label: "รูปแบบ",  type: "select", section: "props", options: ["default","success","warning","danger","info"] },
        dataVar: { label: "ตัวแปรข้อมูล (แทนข้อความ)", type: "text", section: "data" },
    },
    "Input Field": {
        label:        { label: "Label",           type: "text",   section: "props" },
        placeholder:  { label: "Placeholder",     type: "text",   section: "props" },
        fieldType:    { label: "ประเภท",          type: "select", section: "props", options: ["text","number","date","email","tel"] },
        required:     { label: "บังคับกรอก",      type: "toggle", section: "props" },
        fieldKey:     { label: "ชื่อตัวแปร",     type: "text",   section: "data" },
        defaultValue: { label: "ค่าเริ่มต้น",    type: "text",   section: "data" },
    },
    "Select Field": {
        label:       { label: "Label",                       type: "text",   section: "props" },
        placeholder: { label: "Placeholder",                 type: "text",   section: "props" },
        fieldKey:    { label: "ชื่อตัวแปร",                 type: "text",   section: "data" },
        dataSource:  { label: "แหล่งข้อมูล",                type: "select", section: "data",
                       options: ["static","/materials","/workers","/customers","/orders","/inventory"] },
        labelField:  { label: "แสดงข้อความจาก field",       type: "text",   section: "data" },
        valueField:  { label: "ค่าจาก field",               type: "text",   section: "data" },
        options:     { label: "ตัวเลือก (static, คั่นด้วย ,)", type: "text", section: "data" },
    },
    "Text Area": {
        label:       { label: "Label",       type: "text",   section: "props" },
        placeholder: { label: "Placeholder", type: "text",   section: "props" },
        rows:        { label: "จำนวนแถว",   type: "number", section: "props" },
        fieldKey:    { label: "ชื่อตัวแปร", type: "text",   section: "data" },
    },
    Button: {
        label:     { label: "ข้อความ",        type: "text",   section: "props" },
        variant:   { label: "รูปแบบ",         type: "select", section: "props", options: ["primary","outline","danger","success"] },
        size:      { label: "ขนาด",           type: "select", section: "props", options: ["sm","md","lg"] },
        fullWidth: { label: "เต็มความกว้าง",  type: "toggle", section: "props" },
        action:         { label: "การกระทำ",              type: "select", section: "action",
                          options: ["none","submit-form","navigate","api-call","show-confirm"] },
        actionEndpoint: { label: "API Endpoint (เช่น /orders)", type: "text",   section: "action" },
        actionMethod:   { label: "HTTP Method",           type: "select", section: "action", options: ["POST","PATCH","PUT","DELETE","GET"] },
        navigateTo:     { label: "URL ปลายทาง",           type: "text",   section: "action" },
        confirmText:    { label: "ข้อความยืนยัน",        type: "text",   section: "action" },
    },
    "Info Card": {
        title:       { label: "ชื่อ",       type: "text",     section: "props" },
        subtitle:    { label: "หัวข้อรอง",  type: "text",     section: "props" },
        content:     { label: "เนื้อหา",    type: "textarea", section: "props" },
        accentColor: { label: "สีขอบ",     type: "select",   section: "props", options: ["blue","green","orange","purple","red","slate"] },
        dataVar:     { label: "ตัวแปรข้อมูล (object key)", type: "text", section: "data" },
    },
    Status: {
        label:   { label: "Label",  type: "text",   section: "props" },
        status:  { label: "สถานะ",  type: "select", section: "props", options: ["pending","in_progress","completed","error"] },
        dataVar: { label: "ตัวแปร (แทนสถานะ)", type: "text", section: "data" },
    },
};

// ── Section configs ───────────────────────────────────────────────────────────
const SECTION_CONFIG: Record<Section, { icon: React.ElementType; label: string; color: string; bg: string }> = {
    props:  { icon: Settings2, label: "Properties",  color: "text-foreground",     bg: "" },
    data:   { icon: Database,  label: "ข้อมูล",      color: "text-blue-600",       bg: "bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-lg" },
    action: { icon: Zap,       label: "การกระทำ",    color: "text-orange-600",     bg: "bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-800/30 rounded-lg" },
};

// ── Field renderer ────────────────────────────────────────────────────────────
function Field({
    label, value, fieldDef, onChange,
}: {
    label: string;
    value: unknown;
    fieldDef: FieldDef;
    onChange: (v: string | number | boolean) => void;
}) {
    const base = "w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition";

    return (
        <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">
                {label}
            </label>

            {fieldDef.type === "toggle" ? (
                <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(value)}
                    onClick={() => onChange(!value)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${Boolean(value) ? "bg-primary" : "bg-muted"}`}
                >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${Boolean(value) ? "translate-x-4.5" : "translate-x-0.5"}`} />
                </button>
            ) : fieldDef.type === "select" ? (
                <select
                    value={String(value ?? "")}
                    onChange={(e) => onChange(e.target.value)}
                    className={base}
                >
                    {(fieldDef.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
            ) : fieldDef.type === "textarea" ? (
                <textarea rows={3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={`${base} resize-none`} />
            ) : fieldDef.type === "number" ? (
                <input type="number" value={String(value ?? "")} onChange={(e) => onChange(Number(e.target.value))} className={base} />
            ) : (
                <input type="text" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={base} placeholder={fieldDef.section === "data" ? "เช่น orderData.customerName" : ""} />
            )}
        </div>
    );
}

// ── Section renderer ─────────────────────────────────────────────────────────
function SectionPanel({
    section, fields, props, setProp,
}: {
    section: Section;
    fields: [string, FieldDef][];
    props: Record<string, unknown>;
    setProp: (key: string, value: string | number | boolean) => void;
}) {
    if (fields.length === 0) return null;
    const cfg = SECTION_CONFIG[section];
    const Icon = cfg.icon;
    return (
        <div className={`p-3 space-y-3 ${cfg.bg}`}>
            {section !== "props" && (
                <div className={`flex items-center gap-1.5 ${cfg.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">{cfg.label}</span>
                </div>
            )}
            {fields.map(([key, def]) => (
                <Field
                    key={key}
                    label={def.label}
                    value={props[key]}
                    fieldDef={def}
                    onChange={(v) => setProp(key, v)}
                />
            ))}
        </div>
    );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function PropertiesPanel() {
    const { selected, nodes, actions } = useEditor((state) => ({
        selected: [...state.events.selected][0] ?? null,
        nodes:    state.nodes,
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

    // Build section → fields map from FIELD_META (show all defined fields)
    const sections: Record<Section, [string, FieldDef][]> = { props: [], data: [], action: [] };
    for (const [key, def] of Object.entries(fieldMeta)) {
        sections[def.section].push([key, def]);
    }
    // Also show any unknown props (not in FIELD_META) as plain text in props section
    for (const key of Object.keys(props)) {
        if (key === "children") continue;
        if (!fieldMeta[key]) {
            sections.props.push([key, { label: key, type: "text", section: "props" }]);
        }
    }

    const hasData   = sections.data.length > 0;
    const hasAction = sections.action.length > 0;

    return (
        <aside className="w-64 shrink-0 border-l bg-card flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b shrink-0">
                <h2 className="text-sm font-semibold">Properties</h2>
            </div>

            <div className="flex-1 overflow-y-auto">
                {/* Block identity chip */}
                <div className="px-4 pt-4 pb-2">
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-xs font-bold text-foreground">{blockName || "Component"}</p>
                        <p className="text-[11px] text-muted-foreground">ID: {selected.slice(0, 8)}</p>
                    </div>
                </div>

                {/* Binding summary badges */}
                {(hasData || hasAction) && (
                    <div className="px-4 pb-2 flex flex-wrap gap-1">
                        {hasData && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-medium">
                                <Database className="h-3 w-3" /> Data
                            </span>
                        )}
                        {hasAction && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-[10px] font-medium">
                                <Zap className="h-3 w-3" /> Actions
                            </span>
                        )}
                    </div>
                )}

                <div className="space-y-2 pb-4">
                    {/* Props section */}
                    {sections.props.length > 0 && (
                        <SectionPanel section="props" fields={sections.props} props={props} setProp={setProp} />
                    )}

                    {/* Data section */}
                    {sections.data.length > 0 && (
                        <>
                            <div className="px-4">
                                <div className="border-t border-blue-200/50 dark:border-blue-800/30" />
                            </div>
                            <div className="px-3">
                                <SectionPanel section="data" fields={sections.data} props={props} setProp={setProp} />
                            </div>
                        </>
                    )}

                    {/* Action section */}
                    {sections.action.length > 0 && (
                        <>
                            <div className="px-4">
                                <div className="border-t border-orange-200/50 dark:border-orange-800/30" />
                            </div>
                            <div className="px-3">
                                <SectionPanel section="action" fields={sections.action} props={props} setProp={setProp} />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
}
