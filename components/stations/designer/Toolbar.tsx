"use client";

import { useEditor } from "@craftjs/core";
import { useState } from "react";
import { Save, Undo2, Redo2, Code2, Trash2, Keyboard, Eye, EyeOff, Smartphone, Tablet, Monitor, Maximize2, Settings2, Cloud, Loader2, AlignLeft, AlignCenter, AlignRight, ZoomIn, ZoomOut, Shrink, PanelRight, PanelRightClose } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CanvasAlignment = "left" | "center" | "right";

// ── Canvas size presets ───────────────────────────────────────────────────────
export interface CanvasSize {
    width:  number | "100%";
    height: number | "100%";
}

export interface CanvasPreset {
    id:     string;
    label:  string;
    size:   CanvasSize;
    icon:   React.ElementType;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
    { id: "mobile",  label: "Mobile",  size: { width: 390,   height: 844   }, icon: Smartphone },
    { id: "tablet",  label: "Tablet",  size: { width: 768,   height: 1024  }, icon: Tablet     },
    { id: "desktop", label: "Desktop", size: { width: 1280,  height: 900   }, icon: Monitor    },
    { id: "full",    label: "Full",    size: { width: "100%", height: "100%" }, icon: Maximize2  },
];

/** @deprecated use CanvasSize */
export type CanvasWidthValue = number | "100%";

interface ToolbarProps {
    templateName:    string;
    onSave:          (craftNodes: Record<string, unknown>) => Promise<void>;
    saving?:         boolean;
    isPreview?:      boolean;
    onTogglePreview?: () => void;
    canvasSize:       CanvasSize;
    onCanvasSize:     (s: CanvasSize) => void;
    alignment:        CanvasAlignment;
    onAlignment:      (a: CanvasAlignment) => void;
    zoom:             number;
    onZoom:           (z: number) => void;
    onFitZoom:        () => void;
    autoSaveStatus?:  "idle" | "pending" | "saving" | "saved";
    showProperties?:     boolean;
    onToggleProperties?: () => void;
}

export function Toolbar({ templateName, onSave, saving, isPreview = false, onTogglePreview, canvasSize, onCanvasSize, alignment, onAlignment, zoom, onZoom, onFitZoom, autoSaveStatus = "idle", showProperties = true, onToggleProperties }: ToolbarProps) {
    const { actions, query, canUndo, canRedo, selected } = useEditor((state, q) => ({
        canUndo: q.history.canUndo(),
        canRedo: q.history.canRedo(),
        selected: [...state.events.selected][0] ?? null,
    }));

    const [showJson,   setShowJson]   = useState(false);
    const [showKeys,   setShowKeys]   = useState(false);
    const [customMode, setCustomMode] = useState(false);
    const [customW,    setCustomW]    = useState(
        typeof canvasSize.width  === "number" ? String(canvasSize.width)  : ""
    );
    const [customH,    setCustomH]    = useState(
        typeof canvasSize.height === "number" ? String(canvasSize.height) : ""
    );

    const activePresetId = CANVAS_PRESETS.find(
        (p) => p.size.width === canvasSize.width && p.size.height === canvasSize.height
    )?.id ?? "custom";

    const handlePreset = (preset: CanvasPreset) => {
        setCustomMode(false);
        setCustomW(typeof preset.size.width  === "number" ? String(preset.size.width)  : "");
        setCustomH(typeof preset.size.height === "number" ? String(preset.size.height) : "");
        onCanvasSize(preset.size);
    };

    const handleCustomCommit = () => {
        const w = parseInt(customW, 10);
        const h = parseInt(customH, 10);
        const newSize: CanvasSize = {
            width:  (!isNaN(w) && w >= 200 && w <= 3840) ? w : canvasSize.width,
            height: (!isNaN(h) && h >= 200 && h <= 5000) ? h : canvasSize.height,
        };
        onCanvasSize(newSize);
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

                {/* Canvas size picker */}
                {!isPreview && (
                    <div className="flex items-center gap-1 rounded-lg border bg-muted/40 px-1.5 py-1">
                        {CANVAS_PRESETS.map((preset) => {
                            const Icon     = preset.icon;
                            const isActive = !customMode && activePresetId === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    title={`${preset.label} (${preset.size.width === "100%" ? "เต็มหน้า" : `${preset.size.width}×${preset.size.height}px`})`}
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
                        {/* Custom size button */}
                        <button
                            type="button"
                            title="กำหนดขนาดเอง"
                            onClick={() => {
                                setCustomMode((p) => !p);
                                setCustomW(typeof canvasSize.width  === "number" ? String(canvasSize.width)  : "");
                                setCustomH(typeof canvasSize.height === "number" ? String(canvasSize.height) : "");
                            }}
                            className={`p-1.5 rounded-md transition-all ${
                                customMode
                                    ? "bg-background shadow-sm text-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Settings2 className="h-3.5 w-3.5" />
                        </button>
                        {/* Custom W × H inputs */}
                        {customMode && (
                            <div className="flex items-center gap-1 pl-1 border-l border-border/60">
                                <span className="text-[10px] text-muted-foreground">W</span>
                                <input
                                    type="number"
                                    min={200}
                                    max={3840}
                                    value={customW}
                                    onChange={(e) => setCustomW(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleCustomCommit()}
                                    onBlur={handleCustomCommit}
                                    placeholder="px"
                                    className="w-14 bg-background border rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary/40 text-center"
                                />
                                <span className="text-[10px] text-muted-foreground">×</span>
                                <span className="text-[10px] text-muted-foreground">H</span>
                                <input
                                    type="number"
                                    min={200}
                                    max={5000}
                                    value={customH}
                                    onChange={(e) => setCustomH(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleCustomCommit()}
                                    onBlur={handleCustomCommit}
                                    placeholder="px"
                                    className="w-14 bg-background border rounded px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary/40 text-center"
                                />
                            </div>
                        )}
                        {/* Current size label */}
                        {!customMode && (
                            <span className="text-[10px] text-muted-foreground pl-1 border-l border-border/60 pr-0.5 min-w-[60px] text-center">
                                {canvasSize.width === "100%" ? "Full" : `${canvasSize.width}×${canvasSize.height}`}
                            </span>
                        )}
                    </div>
                )}

                {/* Canvas alignment */}
                {!isPreview && canvasSize.width !== "100%" && (
                    <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 px-1 py-1">
                        {([
                            { id: "left",   icon: AlignLeft,   title: "ชิดซ้าย" },
                            { id: "center", icon: AlignCenter, title: "ตรงกลาง" },
                            { id: "right",  icon: AlignRight,  title: "ชิดขวา"  },
                        ] as const).map(({ id, icon: Icon, title }) => (
                            <button
                                key={id}
                                type="button"
                                title={title}
                                onClick={() => onAlignment(id)}
                                className={`p-1.5 rounded-md transition-all ${
                                    alignment === id
                                        ? "bg-background shadow-sm text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Icon className="h-3.5 w-3.5" />
                            </button>
                        ))}
                    </div>
                )}

                {/* Zoom controls */}
                {!isPreview && (
                    <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 px-1 py-1">
                        <button
                            type="button"
                            title="Fit to viewport"
                            onClick={onFitZoom}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-all"
                        >
                            <Shrink className="h-3.5 w-3.5" />
                        </button>
                        <div className="w-px h-4 bg-border/60 mx-0.5" />
                        <button
                            type="button"
                            title="ซูมออก"
                            onClick={() => onZoom(Math.max(25, zoom - 25))}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-all"
                        >
                            <ZoomOut className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => onZoom(100)}
                            className="px-2 py-0.5 rounded text-[11px] font-mono text-muted-foreground hover:text-foreground min-w-[42px] text-center transition-all"
                            title="รีเซ็ต 100%"
                        >
                            {zoom}%
                        </button>
                        <button
                            type="button"
                            title="ซูมเข้า"
                            onClick={() => onZoom(Math.min(200, zoom + 25))}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-all"
                        >
                            <ZoomIn className="h-3.5 w-3.5" />
                        </button>
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

                {!isPreview && onToggleProperties && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onToggleProperties}
                        className="h-8 w-8 p-0"
                        title={showProperties ? "ซ่อน Properties Panel" : "แสดง Properties Panel"}
                    >
                        {showProperties
                            ? <PanelRightClose className="h-3.5 w-3.5" />
                            : <PanelRight      className="h-3.5 w-3.5" />
                        }
                    </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setShowKeys(true)} className="h-8 w-8 p-0" title="Keyboard shortcuts">
                    <Keyboard className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowJson(true)} className="h-8 gap-1.5">
                    <Code2 className="h-3.5 w-3.5" />
                    ดู JSON
                </Button>
                {/* Auto-save status indicator */}
                {autoSaveStatus === "pending" && (
                    <span className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                        ยังไม่บันทึก
                    </span>
                )}
                {autoSaveStatus === "saving" && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> กำลังบันทึก...
                    </span>
                )}
                {autoSaveStatus === "saved" && (
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                        <Cloud className="h-3 w-3" /> บันทึกแล้ว
                    </span>
                )}

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
