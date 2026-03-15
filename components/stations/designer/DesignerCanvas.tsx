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

interface DesignerCanvasProps {
    templateName:  string;
    initialNodes?: Record<string, unknown>;
    onSave:        (craftNodes: Record<string, unknown>) => Promise<void>;
    saving?:       boolean;
    /** Start directly in preview/live mode — hides toolbar edit controls */
    previewOnly?:  boolean;
}

const RESOLVER = {
    CanvasContainer, Section, TwoColumns, Column,
    Heading, Paragraph, Divider, Spacer, Badge,
    InputField, SelectField, TextAreaField, ButtonBlock,
    InfoCard, StatusIndicator, RecordList, RecordDetail, StationSequencePicker,
};

/** Syncs preview (enabled/disabled) into Craft.js options — must be inside <Editor> */
function EditorModeSync({ enabled }: { enabled: boolean }) {
    const { actions } = useEditor();
    useEffect(() => {
        actions.setOptions((opts: Record<string, unknown>) => { opts.enabled = enabled; });
    }, [actions, enabled]);
    return null;
}

/** Auto-saves 1.5 s after any node change. Skips the initial hydration render. */
function AutoSave({
    onSave,
    enabled,
    onStatusChange,
}: {
    onSave:          (json: Record<string, unknown>) => Promise<void>;
    enabled:         boolean;
    onStatusChange?: (status: "idle" | "saving" | "saved") => void;
}) {
    const { query, nodes } = useEditor((state) => ({ nodes: state.nodes }));
    const initializedRef   = useRef(false);
    const timerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Skip the first call — that's just Craft.js hydrating from initialNodes
        if (!initializedRef.current) { initializedRef.current = true; return; }
        if (!enabled) return;

        if (timerRef.current) clearTimeout(timerRef.current);
        onStatusChange?.("idle");
        timerRef.current = setTimeout(async () => {
            try {
                onStatusChange?.("saving");
                const json = JSON.parse(query.serialize()) as Record<string, unknown>;
                await onSave(json);
                onStatusChange?.("saved");
                setTimeout(() => onStatusChange?.("idle"), 2000);
            } catch {
                onStatusChange?.("idle");
            }
        }, 1500);

        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes]);

    return null;
}

export function DesignerCanvas({ templateName, initialNodes, onSave, saving, previewOnly = false }: DesignerCanvasProps) {
    const [isPreview,   setIsPreview]   = useState(previewOnly);
    const [canvasSize,  setCanvasSize]  = useState<CanvasSize>({ width: 900, height: 700 });
    const [alignment,   setAlignment]   = useState<CanvasAlignment>("center");
    const [autoStatus,  setAutoStatus]  = useState<"idle" | "saving" | "saved">("idle");

    return (
        <PreviewContext.Provider value={isPreview}>
            <Editor resolver={RESOLVER}>
                <EditorModeSync enabled={!isPreview} />
                <KeyboardShortcuts />
                {/* Auto-save on every node change (1.5 s debounce) */}
                {!previewOnly && (
                    <AutoSave onSave={onSave} enabled={!isPreview} onStatusChange={setAutoStatus} />
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
                            onCanvasSize={setCanvasSize}
                            alignment={alignment}
                            onAlignment={setAlignment}
                            autoSaveStatus={autoStatus}
                        />
                    )}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Hide palette + properties in preview */}
                        {!isPreview && <BlockPalette />}

                        {/* Canvas */}
                        <main className={`flex-1 overflow-auto p-8 transition-colors ${
                            isPreview
                                ? "bg-white dark:bg-slate-950 [&_*]:!cursor-default"
                                : "bg-slate-100 dark:bg-slate-900/60"
                        }`}>
                            {isPreview && !previewOnly && (
                                <div className="max-w-2xl mx-auto mb-3">
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                        Preview Mode — กดปุ่มได้จริง, Select ดึงข้อมูล API จริง
                                    </div>
                                </div>
                            )}
                            <div
                                style={canvasSize.width === "100%" ? {} : {
                                    width:     canvasSize.width,
                                    minHeight: canvasSize.height !== "100%" ? canvasSize.height : undefined,
                                    marginLeft:  alignment === "right"  ? "auto" : alignment === "center" ? "auto" : 0,
                                    marginRight: alignment === "left"   ? "auto" : alignment === "center" ? "auto" : 0,
                                }}
                                className={canvasSize.width === "100%" ? "w-full" : ""}
                            >
                                <Frame data={initialNodes ? JSON.stringify(initialNodes) : undefined}>
                                    <Element
                                        is={CanvasContainer}
                                        canvas
                                        id="root-canvas"
                                        className="min-h-[500px] w-full"
                                    />
                                </Frame>
                            </div>
                        </main>

                        {!isPreview && <PropertiesPanel />}
                    </div>
                </div>
            </Editor>
        </PreviewContext.Provider>
    );
}
