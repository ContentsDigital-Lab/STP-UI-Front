"use client";

import { useEditor } from "@craftjs/core";
import { useState } from "react";
import { Save, Undo2, Redo2, Code2, Trash2, Keyboard, Eye, EyeOff, Smartphone, Tablet, Monitor, Maximize2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// ── Canvas width presets ───────────────────────────────────────────────────────
export interface CanvasPreset {
    id:     string;
    label:  string;
    width:  number | "100%";
    icon:   React.ElementType;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
    { id: "mobile",  label: "Mobile",  width: 390,   icon: Smartphone },
    { id: "tablet",  label: "Tablet",  width: 768,   icon: Tablet     },
    { id: "desktop", label: "Desktop", width: 1280,  icon: Monitor    },
    { id: "full",    label: "Full",    width: "100%", icon: Maximize2  },
];

export type CanvasWidthValue = number | "100%";

interface ToolbarProps {
    templateName:    string;
    onSave:          (craftNodes: Record<string, unknown>) => Promise<void>;
    saving?:         boolean;
    isPreview?:      boolean;
    onTogglePreview?: () => void;
    canvasWidth:     CanvasWidthValue;
    onCanvasWidth:   (w: CanvasWidthValue) => void;
}

export function Toolbar({ templateName, onSave, saving, isPreview = false, onTogglePreview, canvasWidth, onCanvasWidth }: ToolbarProps) {
    const { actions, query, canUndo, canRedo, selected } = useEditor((state, q) => ({
        canUndo: q.history.canUndo(),
        canRedo: q.history.canRedo(),
        selected: [...state.events.selected][0] ?? null,
    }));

    const [showJson,   setShowJson]   = useState(false);
    const [showKeys,   setShowKeys]   = useState(false);
    const [customMode, setCustomMode] = useState(false);
    const [customVal,  setCustomVal]  = useState(
        typeof canvasWidth === "number" ? String(canvasWidth) : ""
    );

    const activePresetId = CANVAS_PRESETS.find((p) => p.width === canvasWidth)?.id ?? "custom";

    const handlePreset = (preset: CanvasPreset) => {
        setCustomMode(false);
        onCanvasWidth(preset.width);
    };

    const handleCustomCommit = () => {
        const n = parseInt(customVal, 10);
        if (!isNaN(n) && n >= 200 && n <= 3840) onCanvasWidth(n);
    };

    const handleSave = async () => {
        const json = JSON.parse(query.serialize());
        await onSave(json);
    };

    const handleDeleteSelected = () => {
        if (!selected) return;
        const node = query.node(selected).get();
        if (!node?.data?.parent) return; // root canvas — cannot delete
        actions.delete(selected);
    };

    return (
        <>
            <header className="flex items-center gap-2 border-b bg-card px-4 py-2.5 shrink-0">
                {/* Template name */}
                <span className="text-sm font-semibold text-foreground mr-2 truncate max-w-[200px]">
                    {templateName}
                </span>

                <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={!canUndo} onClick={() => actions.history.undo()} className="h-8 w-8 p-0">
                        <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="outline" size="sm" disabled={!canRedo} onClick={() => actions.history.redo()} className="h-8 w-8 p-0">
                        <Redo2 className="h-3.5 w-3.5" />
                    </Button>
                </div>

                {selected && (
                    <Button variant="outline" size="sm" onClick={handleDeleteSelected} className="h-8 gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="h-3.5 w-3.5" />
                        ลบ block
                    </Button>
                )}

                {/* Canvas width picker */}
                {!isPreview && (
                    <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-1.5 py-1">
                        {CANVAS_PRESETS.map((preset) => {
                            const Icon     = preset.icon;
                            const isActive = !customMode && activePresetId === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    title={`${preset.label} (${preset.width === "100%" ? "เต็มหน้า" : preset.width + "px"})`}
                                    onClick={() => handlePreset(preset)}
                                    className={`p-1.5 rounded-md transition-all ${
                                        isActive
                                            ? "bg-background shadow-sm text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                </button>
                            );
                        })}
                        {/* Custom width button */}
                        <button
                            type="button"
                            title="กำหนดขนาดเอง"
                            onClick={() => setCustomMode((p) => !p)}
                            className={`p-1.5 rounded-md transition-all ${
                                customMode
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Settings2 className="h-3.5 w-3.5" />
                        </button>
                        {/* Custom input — shown when custom mode active */}
                        {customMode && (
                            <div className="flex items-center gap-1 pl-1 border-l border-border/60">
                                <input
                                    type="number"
                                    min={200}
                                    max={3840}
                                    value={customVal}
                                    onChange={(e) => setCustomVal(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleCustomCommit()}
                                    onBlur={handleCustomCommit}
                                    placeholder="px"
                                    className="w-16 bg-background border rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary/40 text-center"
                                />
                                <span className="text-[10px] text-muted-foreground pr-0.5">px</span>
                            </div>
                        )}
                        {/* Current width label */}
                        {!customMode && (
                            <span className="text-[10px] text-muted-foreground pl-1 border-l border-border/60 pr-0.5 min-w-[40px] text-center">
                                {canvasWidth === "100%" ? "Full" : `${canvasWidth}px`}
                            </span>
                        )}
                    </div>
                )}

                <div className="flex-1" />

                {/* Preview toggle */}
                <Button
                    variant={isPreview ? "default" : "outline"}
                    size="sm"
                    onClick={onTogglePreview}
                    className={`h-8 gap-1.5 ${isPreview ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600" : ""}`}
                    title={isPreview ? "ออกจาก Preview" : "ทดสอบหน้าตา (Preview)"}
                >
                    {isPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {isPreview ? "ออก Preview" : "Preview"}
                </Button>

                <Button variant="outline" size="sm" onClick={() => setShowKeys(true)} className="h-8 w-8 p-0" title="Keyboard shortcuts">
                    <Keyboard className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowJson(true)} className="h-8 gap-1.5">
                    <Code2 className="h-3.5 w-3.5" />
                    ดู JSON
                </Button>
                <Button size="sm" disabled={saving} onClick={handleSave} className="h-8 gap-1.5">
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "กำลังบันทึก..." : "บันทึก"}
                </Button>
            </header>

            {/* Keyboard shortcuts modal */}
            {showKeys && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowKeys(false)}>
                    <div className="bg-card rounded-xl border shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-4 py-3 border-b">
                            <span className="text-sm font-semibold flex items-center gap-2"><Keyboard className="h-4 w-4" /> Keyboard Shortcuts</span>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowKeys(false)}>✕</Button>
                        </div>
                        <div className="p-4 space-y-2.5 text-sm">
                            {[
                                { key: "⌘Z / Ctrl+Z",       desc: "Undo" },
                                { key: "⌘⇧Z / Ctrl+Y",      desc: "Redo" },
                                { key: "Delete / Backspace", desc: "ลบ block ที่เลือก" },
                                { key: "Escape",             desc: "ยกเลิกการเลือก" },
                            ].map(({ key, desc }) => (
                                <div key={key} className="flex items-center justify-between gap-4">
                                    <kbd className="px-2 py-1 rounded-md border bg-muted text-[11px] font-mono text-muted-foreground whitespace-nowrap">{key}</kbd>
                                    <span className="text-muted-foreground text-xs">{desc}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* JSON preview modal */}
            {showJson && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                    onClick={() => setShowJson(false)}
                >
                    <div
                        className="relative bg-card rounded-xl border shadow-xl w-full max-w-2xl mx-4 max-h-[70vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-4 py-3 border-b">
                            <span className="text-sm font-semibold">JSON Schema (Craft.js nodes)</span>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowJson(false)}>✕</Button>
                        </div>
                        <pre className="overflow-auto p-4 text-xs text-muted-foreground flex-1">
                            {JSON.stringify(JSON.parse(query.serialize()), null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </>
    );
}
