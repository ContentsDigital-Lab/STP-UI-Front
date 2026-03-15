"use client";

import { useState, useEffect } from "react";
import { Editor, Frame, Element, useEditor } from "@craftjs/core";
import { BlockPalette }      from "./BlockPalette";
import { PropertiesPanel }   from "./PropertiesPanel";
import { Toolbar }           from "./Toolbar";
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
import { InfoCard }          from "./blocks/InfoCard";
import { StatusIndicator }   from "./blocks/StatusIndicator";

interface DesignerCanvasProps {
    templateName: string;
    initialNodes?: Record<string, unknown>;
    onSave: (craftNodes: Record<string, unknown>) => Promise<void>;
    saving?: boolean;
}

const RESOLVER = {
    CanvasContainer, Section, TwoColumns, Column,
    Heading, Paragraph, Divider, Spacer, Badge,
    InputField, SelectField, TextAreaField, ButtonBlock,
    InfoCard, StatusIndicator,
};

/** Syncs preview (enabled/disabled) into Craft.js options — must be inside <Editor> */
function EditorModeSync({ enabled }: { enabled: boolean }) {
    const { actions } = useEditor();
    useEffect(() => {
        actions.setOptions((opts: Record<string, unknown>) => { opts.enabled = enabled; });
    }, [actions, enabled]);
    return null;
}

export function DesignerCanvas({ templateName, initialNodes, onSave, saving }: DesignerCanvasProps) {
    const [isPreview, setIsPreview] = useState(false);

    return (
        <PreviewContext.Provider value={isPreview}>
            <Editor resolver={RESOLVER}>
                <EditorModeSync enabled={!isPreview} />
                <KeyboardShortcuts />
                <div className="flex flex-col h-full">
                    <Toolbar
                        templateName={templateName}
                        onSave={onSave}
                        saving={saving}
                        isPreview={isPreview}
                        onTogglePreview={() => setIsPreview((p) => !p)}
                    />
                    <div className="flex flex-1 overflow-hidden">
                        {/* Hide palette + properties in preview */}
                        {!isPreview && <BlockPalette />}

                        {/* Canvas */}
                        <main className={`flex-1 overflow-auto p-8 transition-colors ${
                            isPreview
                                ? "bg-white dark:bg-slate-950 [&_*]:!cursor-default"
                                : "bg-slate-100 dark:bg-slate-900/60"
                        }`}>
                            {isPreview && (
                                <div className="max-w-2xl mx-auto mb-3">
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                        Preview Mode — กดปุ่มได้จริง, Select ดึงข้อมูล API จริง
                                    </div>
                                </div>
                            )}
                            <div className="max-w-2xl mx-auto">
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
