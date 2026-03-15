"use client";

import { useState, useRef, useEffect } from "react";
import { useEditor } from "@craftjs/core";
import { Database, Zap, Settings2, HelpCircle, ChevronDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type Section  = "props" | "data" | "action";
type FieldDef = {
    label:         string;
    hint?:         string;
    type:          "text" | "number" | "select" | "textarea" | "toggle";
    options?:      string[];
    optionLabels?: string[];
    placeholder?:  string;
    suggestions?:  string[];              // combo-box suggestions
    section:       Section;
    showWhen?:     { field: string; value: string | string[] };
};

// ── Shared suggestion banks ───────────────────────────────────────────────────
const FIELD_KEY_SUGGESTIONS = ["customerName","materialId","workerId","quantity","notes","deadline","status","description","price","orderId","requestId","email","phone","address","remark","type"];
const DATA_VAR_SUGGESTIONS   = ["order.status","order.quantity","order.customer.name","order.material.name","order.priority","order.assignedTo.name","request.details.type","request.details.estimatedPrice","request.deadline","request.deliveryLocation","request.customer.name"];
const ENDPOINT_SUGGESTIONS   = ["/orders","/materials","/workers","/customers","/requests","/claims","/withdrawals"];
const NAVIGATE_SUGGESTIONS   = ["/production","/request","/stations","/inventory","/withdrawals","/claims","/logs","/settings"];
const LABEL_FIELD_SUGGESTIONS = ["name","username","title","type","status","position"];
const VALUE_FIELD_SUGGESTIONS = ["_id","name","id"];
const CONFIRM_SUGGESTIONS    = ["ต้องการดำเนินการต่อใช่ไหม?","ยืนยันการบันทึกข้อมูล?","ต้องการส่งข้อมูลใช่ไหม?","ยืนยันการลบรายการนี้?"];

// ── Field metadata ─────────────────────────────────────────────────────────────
const FIELD_META: Record<string, Record<string, FieldDef>> = {
    Section: {
        bgColor: { label: "สีพื้นหลัง", type: "select", section: "props", options: ["white","gray","blue","green","yellow"], optionLabels: ["ขาว","เทา","ฟ้า","เขียว","เหลือง"] },
        padding: { label: "ระยะห่างด้านใน", type: "select", section: "props", options: ["none","sm","md","lg"], optionLabels: ["ไม่มี","เล็ก","กลาง","ใหญ่"] },
    },
    "2 Columns": {
        gap: { label: "ช่องว่างระหว่างคอลัมน์", type: "select", section: "props", options: ["2","4","6","8"], optionLabels: ["แคบมาก","แคบ","กลาง","กว้าง"] },
    },
    Heading: {
        text:    { label: "ข้อความหัวข้อ",  type: "text",   section: "props", placeholder: "พิมพ์หัวข้อที่นี่" },
        level:   { label: "ขนาดหัวข้อ",    type: "select", section: "props", options: ["h1","h2","h3","h4"], optionLabels: ["ใหญ่มาก (H1)","ใหญ่ (H2)","กลาง (H3)","เล็ก (H4)"] },
        align:   { label: "การจัดวาง",     type: "select", section: "props", options: ["left","center","right"], optionLabels: ["ชิดซ้าย","กึ่งกลาง","ชิดขวา"] },
        color:   { label: "สีตัวอักษร",    type: "select", section: "props", options: ["default","primary","muted","blue","green"], optionLabels: ["ปกติ","สีหลัก","เทา","ฟ้า","เขียว"] },
        dataVar: { label: "เชื่อมกับข้อมูล", type: "text", section: "data", hint: "ชื่อตัวแปรที่จะนำมาแสดงแทนข้อความ", placeholder: "เช่น order.customerName", suggestions: DATA_VAR_SUGGESTIONS },
    },
    Paragraph: {
        text:    { label: "ข้อความ",       type: "textarea", section: "props", placeholder: "พิมพ์ข้อความที่นี่" },
        align:   { label: "การจัดวาง",     type: "select",   section: "props", options: ["left","center","right"], optionLabels: ["ชิดซ้าย","กึ่งกลาง","ชิดขวา"] },
        size:    { label: "ขนาดตัวอักษร",  type: "select",   section: "props", options: ["sm","base","lg"], optionLabels: ["เล็ก","ปกติ","ใหญ่"] },
        dataVar: { label: "เชื่อมกับข้อมูล", type: "text", section: "data", hint: "ชื่อตัวแปรที่จะนำมาแสดงแทนข้อความ", placeholder: "เช่น order.description", suggestions: DATA_VAR_SUGGESTIONS },
    },
    Divider: {
        spacing: { label: "ระยะห่าง", type: "select", section: "props", options: ["sm","md","lg"], optionLabels: ["น้อย","กลาง","มาก"] },
        style:   { label: "รูปแบบเส้น", type: "select", section: "props", options: ["solid","dashed"], optionLabels: ["เส้นทึบ","เส้นประ"] },
    },
    Spacer: {
        height: { label: "ความสูง (px)", type: "number", section: "props" },
    },
    Badge: {
        text:    { label: "ข้อความ",  type: "text",   section: "props", placeholder: "เช่น กำลังดำเนินการ" },
        variant: { label: "สีป้าย",   type: "select", section: "props", options: ["default","success","warning","danger","info"], optionLabels: ["เทา","เขียว (สำเร็จ)","เหลือง (เตือน)","แดง (ผิดพลาด)","ฟ้า (ข้อมูล)"] },
        dataVar: { label: "เชื่อมกับข้อมูล", type: "text", section: "data", hint: "ชื่อตัวแปรที่จะแสดงแทนข้อความในป้าย", placeholder: "เช่น order.status", suggestions: DATA_VAR_SUGGESTIONS },
    },
    "Input Field": {
        label:        { label: "ชื่อช่องกรอก",               type: "text",   section: "props", placeholder: "เช่น ชื่อลูกค้า" },
        placeholder:  { label: "ข้อความใบ้ในช่อง",           type: "text",   section: "props", placeholder: "เช่น กรอกชื่อลูกค้า..." },
        fieldType:    { label: "ประเภทข้อมูล",                type: "select", section: "props", options: ["text","number","date","email","tel"], optionLabels: ["ข้อความ","ตัวเลข","วันที่","อีเมล","เบอร์โทร"] },
        required:     { label: "บังคับกรอก",                  type: "toggle", section: "props" },
        fieldKey:     { label: "ชื่อตัวแปร (ใช้ในฟอร์ม)",   type: "text",   section: "data", hint: "ชื่อที่จะใช้ระบุข้อมูลในช่องนี้เมื่อส่งฟอร์ม", placeholder: "เช่น customerName", suggestions: FIELD_KEY_SUGGESTIONS },
        defaultValue: { label: "ค่าเริ่มต้น",                type: "text",   section: "data", placeholder: "ค่าที่แสดงอยู่แล้วเมื่อเปิดหน้า" },
    },
    "Select Field": {
        label:       { label: "ชื่อช่องเลือก",            type: "text",   section: "props", placeholder: "เช่น เลือกวัสดุ" },
        placeholder: { label: "ข้อความตอนยังไม่เลือก",    type: "text",   section: "props", placeholder: "เช่น -- เลือก --" },
        fieldKey:    { label: "ชื่อตัวแปร (ใช้ในฟอร์ม)", type: "text",   section: "data", hint: "ชื่อที่จะใช้ระบุข้อมูลที่เลือกเมื่อส่งฟอร์ม", placeholder: "เช่น materialId", suggestions: FIELD_KEY_SUGGESTIONS },
        dataSource:  { label: "ดึงตัวเลือกมาจาก",        type: "select", section: "data", options: ["static","/materials","/workers","/customers","/orders","/inventory"], optionLabels: ["กำหนดเอง","รายการวัสดุ","รายการพนักงาน","รายการลูกค้า","รายการออเดอร์","คลังสินค้า"] },
        options:     { label: "รายการตัวเลือก",           type: "text",   section: "data", hint: "พิมพ์ตัวเลือกแต่ละอัน คั่นด้วยเครื่องหมายจุลภาค (,)", placeholder: "ตัวเลือก A, ตัวเลือก B, ตัวเลือก C", showWhen: { field: "dataSource", value: "static" } },
        labelField:  { label: "แสดงข้อความจากฟิลด์",    type: "text",   section: "data", hint: "ฟิลด์ที่จะนำมาแสดงเป็นชื่อตัวเลือก (ค่าเริ่มต้น: name)", placeholder: "name", suggestions: LABEL_FIELD_SUGGESTIONS, showWhen: { field: "dataSource", value: ["/materials","/workers","/customers","/orders","/inventory"] } },
        valueField:  { label: "ค่าที่ส่งเป็นฟิลด์",    type: "text",   section: "data", hint: "ฟิลด์ที่จะใช้เป็นค่าเมื่อเลือก (ค่าเริ่มต้น: _id)", placeholder: "_id", suggestions: VALUE_FIELD_SUGGESTIONS, showWhen: { field: "dataSource", value: ["/materials","/workers","/customers","/orders","/inventory"] } },
    },
    "Text Area": {
        label:       { label: "ชื่อช่องข้อความ",         type: "text",   section: "props", placeholder: "เช่น หมายเหตุ" },
        placeholder: { label: "ข้อความใบ้ในช่อง",        type: "text",   section: "props", placeholder: "เช่น กรอกรายละเอียด..." },
        rows:        { label: "ความสูงช่อง (จำนวนบรรทัด)", type: "number", section: "props" },
        fieldKey:    { label: "ชื่อตัวแปร (ใช้ในฟอร์ม)", type: "text",   section: "data", hint: "ชื่อที่จะใช้ระบุข้อความนี้เมื่อส่งฟอร์ม", placeholder: "เช่น notes", suggestions: FIELD_KEY_SUGGESTIONS },
    },
    Button: {
        label:     { label: "ข้อความบนปุ่ม",    type: "text",   section: "props", placeholder: "เช่น บันทึก, ยืนยัน" },
        variant:   { label: "รูปแบบปุ่ม",       type: "select", section: "props", options: ["primary","outline","danger","success"], optionLabels: ["สีหลัก (เน้น)","กรอบเส้น","แดง (ลบ/ยกเลิก)","เขียว (ยืนยัน)"] },
        size:      { label: "ขนาดปุ่ม",         type: "select", section: "props", options: ["sm","md","lg"], optionLabels: ["เล็ก","กลาง","ใหญ่"] },
        fullWidth: { label: "ยืดเต็มความกว้าง", type: "toggle", section: "props" },
        action:         { label: "เมื่อกดปุ่มจะ...", type: "select", section: "action", options: ["none","submit-form","navigate","api-call","show-confirm"], optionLabels: ["ไม่มีการกระทำ","ส่งข้อมูลฟอร์ม","ไปยังหน้าอื่น","เรียกใช้ API","แสดงการยืนยันก่อน"] },
        actionEndpoint: { label: "ส่งข้อมูลไปที่ (URL ปลายทาง)", type: "text",   section: "action", hint: "เช่น /orders — ถามทีมเทคนิคหากไม่แน่ใจ", placeholder: "เช่น /orders", suggestions: ENDPOINT_SUGGESTIONS, showWhen: { field: "action", value: ["submit-form","api-call"] } },
        actionMethod:   { label: "ประเภทการส่งข้อมูล",           type: "select", section: "action", options: ["POST","PATCH","PUT","DELETE","GET"], optionLabels: ["เพิ่มข้อมูลใหม่","แก้ไขข้อมูล","แทนที่ข้อมูลทั้งหมด","ลบข้อมูล","ดึงข้อมูล"], showWhen: { field: "action", value: ["submit-form","api-call"] } },
        navigateTo:     { label: "ลิงก์หน้าที่ต้องการไป",       type: "text",   section: "action", hint: "พิมพ์ URL หน้าที่ต้องการ เช่น /production", placeholder: "เช่น /production", suggestions: NAVIGATE_SUGGESTIONS, showWhen: { field: "action", value: "navigate" } },
        confirmText:    { label: "ข้อความถามยืนยัน",            type: "text",   section: "action", hint: "ข้อความที่จะแสดงก่อนดำเนินการ", placeholder: "เช่น ต้องการดำเนินการต่อใช่ไหม?", suggestions: CONFIRM_SUGGESTIONS, showWhen: { field: "action", value: "show-confirm" } },
    },
    "Info Card": {
        title:       { label: "ชื่อการ์ด",      type: "text",     section: "props", placeholder: "เช่น ข้อมูลออเดอร์" },
        subtitle:    { label: "หัวข้อรอง",      type: "text",     section: "props", placeholder: "หัวข้อย่อย (ไม่บังคับ)" },
        content:     { label: "เนื้อหา",        type: "textarea", section: "props", placeholder: "รายละเอียด..." },
        accentColor: { label: "สีแถบข้าง",     type: "select",   section: "props", options: ["blue","green","orange","purple","red","slate"], optionLabels: ["ฟ้า","เขียว","ส้ม","ม่วง","แดง","เทา"] },
        dataVar:     { label: "เชื่อมกับข้อมูล", type: "text",   section: "data", hint: "ชื่อ object ที่จะนำข้อมูลมาแสดงในการ์ด", placeholder: "เช่น selectedOrder", suggestions: DATA_VAR_SUGGESTIONS },
    },
    Status: {
        label:   { label: "ชื่อหัวข้อสถานะ",    type: "text",   section: "props", placeholder: "เช่น สถานะงาน" },
        status:  { label: "สถานะที่แสดง",       type: "select", section: "props", options: ["pending","in_progress","completed","error"], optionLabels: ["รอดำเนินการ","กำลังดำเนินการ","เสร็จแล้ว","มีปัญหา"] },
        dataVar: { label: "เชื่อมกับข้อมูลสถานะ", type: "text", section: "data", hint: "ชื่อตัวแปรที่มีค่าสถานะ", placeholder: "เช่น order.status", suggestions: DATA_VAR_SUGGESTIONS },
    },
};

const SECTION_CONFIG: Record<Section, { icon: React.ElementType; label: string; color: string; bg: string }> = {
    props:  { icon: Settings2, label: "รูปแบบ",   color: "text-foreground", bg: "" },
    data:   { icon: Database,  label: "ข้อมูล",   color: "text-blue-600",   bg: "bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30 rounded-lg" },
    action: { icon: Zap,       label: "การกระทำ", color: "text-orange-600", bg: "bg-orange-50/60 dark:bg-orange-950/20 border border-orange-200/50 dark:border-orange-800/30 rounded-lg" },
};

function isVisible(def: FieldDef, props: Record<string, unknown>): boolean {
    if (!def.showWhen) return true;
    const { field, value } = def.showWhen;
    const cur = String(props[field] ?? "");
    return Array.isArray(value) ? value.includes(cur) : cur === value;
}

// ── Combo box field ────────────────────────────────────────────────────────────
function ComboField({ value, onChange, placeholder, suggestions, base }: {
    value: unknown; onChange: (v: string) => void; placeholder?: string; suggestions: string[]; base: string;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState(String(value ?? ""));
    const ref = useRef<HTMLDivElement>(null);

    // sync external value → query
    useEffect(() => { setQuery(String(value ?? "")); }, [value]);

    const filtered = query
        ? suggestions.filter((s) => s.toLowerCase().includes(query.toLowerCase()))
        : suggestions;

    const handleSelect = (s: string) => { onChange(s); setQuery(s); setOpen(false); };

    return (
        <div ref={ref} className="relative">
            <div className="flex">
                <input
                    type="text"
                    value={query}
                    placeholder={placeholder}
                    className={`${base} rounded-r-none border-r-0`}
                    onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                />
                <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
                    className="border border-l-0 rounded-r-lg px-2 bg-muted/30 hover:bg-muted/60 transition"
                    tabIndex={-1}
                >
                    <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
            </div>
            {open && filtered.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-0.5 rounded-lg border bg-popover shadow-lg max-h-44 overflow-y-auto">
                    {filtered.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onMouseDown={() => handleSelect(s)}
                            className={`w-full px-3 py-1.5 text-xs text-left hover:bg-muted/50 font-mono truncate ${s === String(value ?? "") ? "bg-primary/10 text-primary font-medium" : ""}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Field renderer ────────────────────────────────────────────────────────────
function Field({ label, value, fieldDef, onChange }: {
    label: string; value: unknown; fieldDef: FieldDef; onChange: (v: string | number | boolean) => void;
}) {
    const base = "w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition";

    return (
        <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block">{label}</label>

            {fieldDef.type === "toggle" ? (
                <button type="button" role="switch" aria-checked={Boolean(value)}
                    onClick={() => onChange(!value)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${Boolean(value) ? "bg-primary" : "bg-muted border"}`}
                >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${Boolean(value) ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
            ) : fieldDef.type === "select" ? (
                <select value={String(value ?? (fieldDef.options?.[0] ?? ""))} onChange={(e) => onChange(e.target.value)} className={base}>
                    {(fieldDef.options ?? []).map((o, i) => (
                        <option key={o} value={o}>{fieldDef.optionLabels?.[i] ?? o}</option>
                    ))}
                </select>
            ) : fieldDef.type === "textarea" ? (
                <textarea rows={3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={`${base} resize-none`} placeholder={fieldDef.placeholder} />
            ) : fieldDef.type === "number" ? (
                <input type="number" value={String(value ?? "")} onChange={(e) => onChange(Number(e.target.value))} className={base} />
            ) : fieldDef.suggestions?.length ? (
                <ComboField value={value} onChange={(v) => onChange(v)} placeholder={fieldDef.placeholder} suggestions={fieldDef.suggestions} base={base} />
            ) : (
                <input type="text" value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={base} placeholder={fieldDef.placeholder} />
            )}

            {fieldDef.hint && (
                <p className="text-[10px] text-muted-foreground/70 flex items-start gap-1">
                    <HelpCircle className="h-3 w-3 shrink-0 mt-0.5" />{fieldDef.hint}
                </p>
            )}
        </div>
    );
}

// ── Section renderer ──────────────────────────────────────────────────────────
function SectionPanel({ section, fields, props, setProp }: {
    section: Section; fields: [string, FieldDef][]; props: Record<string, unknown>; setProp: (key: string, value: string | number | boolean) => void;
}) {
    const visible = fields.filter(([, def]) => isVisible(def, props));
    if (visible.length === 0) return null;
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
            {visible.map(([key, def]) => (
                <Field key={key} label={def.label} value={props[key]} fieldDef={def} onChange={(v) => setProp(key, v)} />
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
                <div className="px-4 py-3 border-b"><h2 className="text-sm font-semibold">Properties</h2></div>
                <div className="flex-1 flex items-center justify-center p-6">
                    <p className="text-xs text-muted-foreground text-center leading-relaxed">คลิก component บน Canvas<br />เพื่อแก้ไข properties</p>
                </div>
            </aside>
        );
    }

    const node      = nodes[selected];
    const props     = (node?.data?.props ?? {}) as Record<string, unknown>;
    const blockName = node?.data?.displayName ?? node?.data?.name ?? "";
    const fieldMeta = FIELD_META[blockName] ?? {};
    const setProp   = (key: string, value: string | number | boolean) => {
        actions.setProp(selected, (p: Record<string, unknown>) => { p[key] = value; });
    };

    const sections: Record<Section, [string, FieldDef][]> = { props: [], data: [], action: [] };
    for (const [key, def] of Object.entries(fieldMeta)) sections[def.section].push([key, def]);
    for (const key of Object.keys(props)) {
        if (key !== "children" && !fieldMeta[key]) sections.props.push([key, { label: key, type: "text", section: "props" }]);
    }

    const hasData   = sections.data.some(([, def]) => isVisible(def, props));
    const hasAction = sections.action.some(([, def]) => isVisible(def, props));

    return (
        <aside className="w-64 shrink-0 border-l bg-card flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b shrink-0"><h2 className="text-sm font-semibold">Properties</h2></div>
            <div className="flex-1 overflow-y-auto">
                <div className="px-4 pt-4 pb-2">
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <p className="text-xs font-bold text-foreground">{blockName || "Component"}</p>
                        <p className="text-[11px] text-muted-foreground">ID: {selected.slice(0, 8)}</p>
                    </div>
                </div>
                {(hasData || hasAction) && (
                    <div className="px-4 pb-2 flex flex-wrap gap-1">
                        {hasData   && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-medium"><Database className="h-3 w-3" /> เชื่อมข้อมูล</span>}
                        {hasAction && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-[10px] font-medium"><Zap className="h-3 w-3" /> มีการกระทำ</span>}
                    </div>
                )}
                <div className="space-y-2 pb-4">
                    {sections.props.length > 0 && <SectionPanel section="props" fields={sections.props} props={props} setProp={setProp} />}
                    {sections.data.length > 0 && (
                        <>
                            <div className="px-4"><div className="border-t border-blue-200/50 dark:border-blue-800/30" /></div>
                            <div className="px-3"><SectionPanel section="data" fields={sections.data} props={props} setProp={setProp} /></div>
                        </>
                    )}
                    {sections.action.length > 0 && (
                        <>
                            <div className="px-4"><div className="border-t border-orange-200/50 dark:border-orange-800/30" /></div>
                            <div className="px-3"><SectionPanel section="action" fields={sections.action} props={props} setProp={setProp} /></div>
                        </>
                    )}
                </div>
            </div>
        </aside>
    );
}
