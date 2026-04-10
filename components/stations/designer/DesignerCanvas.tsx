"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Editor, Frame, Element, useEditor } from "@craftjs/core";
import { BlockPalette }      from "./BlockPalette";
import { PropertiesPanel }   from "./PropertiesPanel";
import { Toolbar, CanvasSize, CanvasAlignment } from "./Toolbar";
import { CanvasContainer }   from "./CanvasContainer";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
import { PreviewContext }     from "./PreviewContext";
import { StationProvider }   from "./StationContext";

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
import { StationHistory }         from "./blocks/StationHistory";
import { InventoryStockBlock }    from "./blocks/InventoryStockBlock";
import { OrderReleasePanel }      from "./blocks/OrderReleasePanel";
import { QrScanBlock }            from "./blocks/QrScanBlock";
import { StationQueueBlock }      from "./blocks/StationQueueBlock";
import { StickerPrintBlock }      from "./blocks/StickerPrintBlock";
import { QCInspectorBlock }       from "./blocks/QCInspectorBlock";

interface DesignerCanvasProps {
    templateName:        string;
    /** When set, toolbar title becomes editable (PATCH name via parent). */
    onRenameTemplate?:   (name: string) => Promise<void>;
    renamingTemplate?:   boolean;
    initialNodes?:       Record<string, unknown>;
    onSave:              (craftNodes: Record<string, unknown>) => Promise<void>;
    saving?:             boolean;
    onSaveStatusChange?: (status: SaveStatus) => void;
    /** Start directly in preview/live mode — hides toolbar edit controls */
    previewOnly?:        boolean;
    /** ID of the current station — used by RecordList to filter orders for this station */
    stationId?:          string | null;
    /** Name of the current station — used by QR scan to identify which station the worker is at */
    stationName?:        string | null;
    /** Order data to pre-populate context (e.g. from ?orderId= URL param) */
    initialData?:        Record<string, unknown> | null;
    /** Request (บิล) data to pre-populate context (e.g. from ?requestId= URL param) */
    initialRequestData?: Record<string, unknown> | null;
}


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

/**
 * Loads serialized node data into the editor via actions.deserialize().
 * Unlike Frame's `data` prop, this runs inside useEffect with try-catch,
 * so corrupt data logs an error instead of crashing the whole page.
 */
function NodeLoader({ data }: { data: string | undefined }) {
    const { actions } = useEditor();
    const loadedRef = useRef(false);
    useEffect(() => {
        if (loadedRef.current || !data) return;
        loadedRef.current = true;
        try {
            actions.deserialize(data);
        } catch (err) {
            console.error("[NodeLoader] Failed to deserialize template data:", err);
        }
    }, [actions, data]);
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
 * Sanitizes serialized Craft.js node data so it can be safely deserialized.
 *
 * Handles: missing sub-objects, missing/invalid `type`, dangling child refs,
 * and component types not present in the resolver.
 */
function sanitizeCraftNodes(raw: Record<string, unknown>, validTypes: Set<string>): string | undefined {
    const clean: Record<string, unknown> = {};
    for (const [id, node] of Object.entries(raw)) {
        if (!node || typeof node !== "object" || Array.isArray(node)) continue;
        const n = node as Record<string, unknown>;

        // Validate type — must be { resolvedName: "SomeComponent" } matching a resolver key
        let type = n.type as Record<string, unknown> | undefined;
        if (type && typeof type === "object" && typeof type.resolvedName === "string") {
            if (!validTypes.has(type.resolvedName)) {
                console.warn(`[sanitizeCraftNodes] Node "${id}" has unknown type "${type.resolvedName}", skipping`);
                continue;
            }
        } else if (id === "ROOT") {
            type = { resolvedName: "CanvasContainer" };
        } else {
            continue;
        }

        clean[id] = {
            ...n,
            type,
            props:       (n.props && typeof n.props === "object" && !Array.isArray(n.props))       ? n.props       : {},
            custom:      (n.custom && typeof n.custom === "object" && !Array.isArray(n.custom))     ? n.custom      : {},
            linkedNodes: (n.linkedNodes && typeof n.linkedNodes === "object" && !Array.isArray(n.linkedNodes)) ? n.linkedNodes : {},
            nodes:       Array.isArray(n.nodes) ? n.nodes : [],
        };
    }
    if (!("ROOT" in clean)) return undefined;
    // Prune references to nodes that don't exist in the clean set
    for (const node of Object.values(clean)) {
        const n = node as Record<string, unknown>;
        if (Array.isArray(n.nodes)) {
            n.nodes = (n.nodes as string[]).filter(cid => cid in clean);
        }
        if (n.linkedNodes && typeof n.linkedNodes === "object") {
            const ln = n.linkedNodes as Record<string, string>;
            for (const key of Object.keys(ln)) {
                if (!(ln[key] in clean)) delete ln[key];
            }
        }
    }
    return JSON.stringify(clean);
}

export function DesignerCanvas({
    templateName,
    onRenameTemplate,
    renamingTemplate = false,
    initialNodes,
    onSave,
    saving,
    onSaveStatusChange,
    previewOnly = false,
    stationId,
    stationName,
    initialData,
    initialRequestData,
}: DesignerCanvasProps) {
    // Keep RESOLVER inside component so Turbopack hot-reload always picks up fresh module references
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const RESOLVER = useMemo(() => ({
        CanvasContainer, Section, TwoColumns, Column,
        Heading, Paragraph, Divider, Spacer, Badge,
        InputField, SelectField, TextAreaField, ButtonBlock,
        InfoCard, StatusIndicator, RecordList, RecordDetail, StationSequencePicker, StationHistory,
        InventoryStockBlock, OrderReleasePanel, QrScanBlock, StationQueueBlock, StickerPrintBlock,
        QCInspectorBlock,
    }), []);

    const resolverNames = useMemo(() => new Set(Object.keys(RESOLVER)), [RESOLVER]);

    const [isPreview,      setIsPreview]      = useState(previewOnly);
    const [canvasSize,     setCanvasSize]     = useState<CanvasSize>({ width: 900, height: 700 });
    const [alignment,      setAlignment]      = useState<CanvasAlignment>("center");
    const [zoom,           setZoom]           = useState(100);
    const [autoStatus,     setAutoStatus]     = useState<SaveStatus>("idle");
    const [showProperties, setShowProperties] = useState(false);
    const mainRef = useRef<HTMLElement>(null);

    /** Stable callback for SelectionWatcher — must be memoized so useEffect inside
     *  SelectionWatcher does NOT re-fire every render (which would re-show the panel
     *  immediately after the user hides it). */
    const handleSelection = useCallback((has: boolean) => {
        if (!isPreview) setShowProperties(has);
    }, [isPreview]);

    /** Manual save — also updates the status badge (AutoSave only tracks node-change saves) */
    const handleManualSave = async (json: Record<string, unknown>) => {
        setAutoStatus("saving");
        onSaveStatusChange?.("saving");
        try {
            await onSave(json);
            setAutoStatus("saved");
            onSaveStatusChange?.("saved");
        } catch (err) {
            setAutoStatus("pending");
            onSaveStatusChange?.("pending");
            throw err;
        }
    };

    return (
        <StationProvider stationId={stationId} stationName={stationName} initialOrderData={initialData} initialRequestData={initialRequestData}>
        <PreviewContext.Provider value={isPreview}>
            <Editor resolver={RESOLVER}>
                <EditorModeSync enabled={!isPreview} />
                <SelectionWatcher onSelection={handleSelection} />
                <KeyboardShortcuts />
                <NodeLoader data={
                    initialNodes &&
                    typeof initialNodes === "object" &&
                    !Array.isArray(initialNodes)
                        ? sanitizeCraftNodes(initialNodes, resolverNames)
                        : undefined
                } />
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
                            onRenameTemplate={onRenameTemplate}
                            renamingTemplate={renamingTemplate}
                            onSave={handleManualSave}
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
                            className={`flex-1 min-w-0 transition-colors ${
                                isPreview
                                    ? "p-2 sm:p-4 lg:p-8 bg-white dark:bg-slate-950 [&_*]:!cursor-default overflow-y-auto overflow-x-hidden"
                                    : "p-8 bg-slate-100 dark:bg-slate-900/60 overflow-auto"
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
                                <Frame>
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
        </StationProvider>
    );
}
