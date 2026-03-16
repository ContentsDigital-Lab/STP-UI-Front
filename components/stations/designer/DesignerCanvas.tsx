"use client";

import { useState, useEffect, useRef } from "react";
import { Editor, Frame, Element, useEditor } from "@craftjs/core";
import { BlockPalette }      from "./BlockPalette";
import { PropertiesPanel }   from "./PropertiesPanel";
import { Toolbar, CanvasSize, CanvasAlignment } from "./Toolbar";
import { CanvasContainer }   from "./CanvasContainer";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { PreviewContext }     from "./PreviewContext";

// ─── Layout ──────────────────────────────────────────────────────────────────
import { Section }           from "./blocks/Section";
import { TwoColumns }        from "./blocks/TwoColumns";
import { Column }            from "./blocks/Column";

// ─── Content ─────────────────────────────────────────────────────────────────
import { Heading }           from "./blocks/Heading";
import { Paragraph }         from "./blocks/Paragraph";
import { Divider }           from "./blocks/Divider";
import { Spacer }            from "./blocks/Spacer";
import { Badge }             from "./blocks/Badge";

// ─── Form ────────────────────────────────────────────────────────────────────
import { InputField }        from "./blocks/InputField";
import { SelectField }       from "./blocks/SelectField";
import { TextAreaField }     from "./blocks/TextAreaField";
import { ButtonBlock }       from "./blocks/ButtonBlock";

// ─── Data ────────────────────────────────────────────────────────────────────
import { InfoCard }               from "./blocks/InfoCard";
import { StatusIndicator }        from "./blocks/StatusIndicator";
import { RecordList }             from "./blocks/RecordList";
import { RecordDetail }           from "./blocks/RecordDetail";
import { StationSequencePicker }  from "./blocks/StationSequencePicker";
import { InventoryStockBlock }    from "./blocks/InventoryStockBlock";
import { OrderReleasePanel }      from "./blocks/OrderReleasePanel";

interface DesignerCanvasProps {
    templateName:        string;
    initialNodes?:       Record<string, unknown>;
    onSave:              (craftNodes: Record<string, unknown>) => Promise<void>;
    saving?:             boolean;
    onSaveStatusChange?: (status: SaveStatus) => void;
    /** Start directly in preview/live mode — hides toolbar edit controls */
    previewOnly?:        boolean;
}

const RESOLVER = {
    CanvasContainer, Section, TwoColumns, Column,
    Heading, Paragraph, Divider, Spacer, Badge,
    InputField, SelectField, TextAreaField, ButtonBlock,
    InfoCard, StatusIndicator, RecordList, RecordDetail, StationSequencePicker,
    InventoryStockBlock, OrderReleasePanel,
};

/** Syncs Properties panel visibility with current selection — must be inside <Editor> */
function SelectionWatcher({ onSelection }: { onSelection: (hasSelection: boolean) => void }) {
    const { selected } = useEditor((state) => ({ selected: [...state.events.selected][0] ?? null }));
    useEffect(() => { onSelection(!!selected); }, [selected, onSelection]);
    return null;
}

/** Syncs preview (enabled/disabled) into Craft.js options — must be inside <Editor> */
function EditorModeSync({ enabled }: { enabled: boolean }) {
    const { actions } = useEditor();
    useEffect(() => {
        actions.setOptions((opts: Record<string, unknown>) => { opts.enabled = enabled; });
    }, [actions, enabled]);
    return null;
}

export type SaveStatus = "idle" | "pending" | "saving" | "saved";

/** Auto-saves 5 s after any node change. Skips the initial hydration render. */
function AutoSave({
    onSave,
    enabled,
    onStatusChange,
}: {
    onSave:          (json: Record<string, unknown>) => Promise<void>;
    enabled:         boolean;
    onStatusChange?: (status: SaveStatus) => void;
}) {
    const { query, nodes } = useEditor((state) => ({ nodes: state.nodes }));
    const initializedRef   = useRef(false);
    const timerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Skip the first call — that's just Craft.js hydrating from initialNodes
        if (!initializedRef.current) { initializedRef.current = true; return; }
        if (!enabled) return;

        if (timerRef.current) clearTimeout(timerRef.current);
        onStatusChange?.("pending"); // unsaved changes exist
        timerRef.current = setTimeout(async () => {
            try {
                onStatusChange?.("saving");
                const json = JSON.parse(query.serialize()) as Record<string, unknown>;
                await onSave(json);
                onStatusChange?.("saved");
            } catch (err) {
                console.error("[AutoSave] error:", err);
                onStatusChange?.("pending"); // revert to pending so user knows it needs saving
            }
        }, 5000); // 5 s debounce — avoids rate limiting

        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes]);

    return null;
}

/**
 * Craft.js calls Object.keys() on every node and every node's sub-properties
 * (props, linkedNodes, custom, etc.). If ANY of those values is null/undefined
 * the engine throws "Cannot convert undefined or null to object".
 * This sanitizer ensures each node and its required sub-fields are real objects.
 */
function sanitizeCraftNodes(raw: Record<string, unknown>): string | undefined {
    const clean: Record<string, unknown> = {};
    for (const [id, node] of Object.entries(raw)) {
        if (!node || typeof node !== "object" || Array.isArray(node)) continue;
        const n = node as Record<string, unknown>;
        clean[id] = {
            ...n,
            props:       (n.props && typeof n.props === "object" && !Array.isArray(n.props))       ? n.props       : {},
            custom:      (n.custom && typeof n.custom === "object" && !Array.isArray(n.custom))     ? n.custom      : {},
            linkedNodes: (n.linkedNodes && typeof n.linkedNodes === "object" && !Array.isArray(n.linkedNodes)) ? n.linkedNodes : {},
            nodes:       Array.isArray(n.nodes) ? n.nodes : [],
        };
    }
    return "ROOT" in clean ? JSON.stringify(clean) : undefined;
}

export function DesignerCanvas({ templateName, initialNodes, onSave, saving, onSaveStatusChange, previewOnly = false }: DesignerCanvasProps) {
    const [isPreview,      setIsPreview]      = useState(previewOnly);
    const [canvasSize,     setCanvasSize]     = useState<CanvasSize>({ width: 900, height: 700 });
    const [alignment,      setAlignment]      = useState<CanvasAlignment>("center");
    const [zoom,           setZoom]           = useState(100);
    const [autoStatus,     setAutoStatus]     = useState<SaveStatus>("idle");
    const [showProperties, setShowProperties] = useState(false);
    const mainRef = useRef<HTMLElement>(null);

    return (
        <PreviewContext.Provider value={isPreview}>
            <Editor resolver={RESOLVER}>
                <EditorModeSync enabled={!isPreview} />
                <SelectionWatcher onSelection={(has) => { if (!isPreview) setShowProperties(has); }} />
                <KeyboardShortcuts />
                {/* Auto-save on every node change (1.5 s debounce) */}
                {!previewOnly && (
                    <AutoSave
                        onSave={onSave}
                        enabled={!isPreview}
                        onStatusChange={(s) => { setAutoStatus(s); onSaveStatusChange?.(s); }}
                    />
                )}
                <div className="flex flex-col h-full">
                    {/* Hide entire toolbar in previewOnly (live station) mode */}
                    {!previewOnly && (
                        <Toolbar
                            templateName={templateName}
                            onSave={onSave}
                            saving={saving}
                            isPreview={isPreview}
                            onTogglePreview={() => setIsPreview((p) => !p)}
                            canvasSize={canvasSize}
                            onCanvasSize={(s) => {
                                setCanvasSize(s);
                                if (s.width !== "100%" && mainRef.current) {
                                    const available = mainRef.current.clientWidth - 64;
                                    const fit = Math.min(100, Math.floor((available / (s.width as number)) * 100));
                                    setZoom(Math.max(25, fit));
                                } else {
                                    setZoom(100);
                                }
                            }}
                            alignment={alignment}
                            onAlignment={setAlignment}
                            zoom={zoom}
                            onZoom={setZoom}
                            onFitZoom={() => {
                                if (!mainRef.current || canvasSize.width === "100%") { setZoom(100); return; }
                                const available = mainRef.current.clientWidth - 64; // 32px padding each side
                                const fit = Math.floor((available / (canvasSize.width as number)) * 100);
                                setZoom(Math.max(25, Math.min(200, fit)));
                            }}
                            autoSaveStatus={autoStatus}
                            showProperties={showProperties}
                            onToggleProperties={() => setShowProperties((p) => !p)}
                        />
                    )}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Hide palette + properties in preview */}
                        {!isPreview && <BlockPalette />}

                        {/* Canvas */}
                        <main
                            ref={mainRef}
                            className={`flex-1 min-w-0 overflow-auto p-8 transition-colors ${
                                isPreview
                                    ? "bg-white dark:bg-slate-950 [&_*]:!cursor-default"
                                    : "bg-slate-100 dark:bg-slate-900/60"
                            }`}
                        >
                            {isPreview && !previewOnly && (
                                <div className="w-full mb-3">
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                        Preview Mode — กดปุ่มได้จริง, Select ดึงข้อมูล API จริง
                                    </div>
                                </div>
                            )}
                            {/*
                             * Canvas container — block element with margin: auto for alignment.
                             * Flex approach clips the left side when canvas > viewport.
                             * Block + margin: auto works correctly:
                             *   - canvas < parent → auto margins apply → alignment works
                             *   - canvas > parent → auto margins = 0 → overflows right → main scrolls
                             * CSS zoom scales BOTH visual size AND layout footprint (unlike transform).
                             */}
                            <div
                                style={(isPreview || previewOnly || canvasSize.width === "100%") ? {} : {
                                    display:    "block",
                                    width:      `${canvasSize.width}px`,
                                    minWidth:   `${canvasSize.width}px`,
                                    minHeight:  canvasSize.height !== "100%" ? `${canvasSize.height}px` : undefined,
                                    zoom:       zoom !== 100 ? zoom / 100 : undefined,
                                    marginLeft:  (alignment === "right"  || alignment === "center") ? "auto" : 0,
                                    marginRight: (alignment === "left"   || alignment === "center") ? "auto" : 0,
                                }}
                                className={(isPreview || previewOnly || canvasSize.width === "100%")
                                    ? "w-full"
                                    : "shadow-lg ring-1 ring-black/5 rounded-sm"
                                }
                            >
                                <Frame data={
                                    initialNodes &&
                                    typeof initialNodes === "object" &&
                                    !Array.isArray(initialNodes)
                                        ? sanitizeCraftNodes(initialNodes)
                                        : undefined
                                }>
                                    <Element
                                        is={CanvasContainer}
                                        canvas
                                        id="root-canvas"
                                        className="min-h-[500px] w-full"
                                    />
                                </Frame>
                            </div>
                        </main>

                        {!isPreview && showProperties && <PropertiesPanel />}
                    </div>
                </div>
            </Editor>
        </PreviewContext.Provider>
    );
}
