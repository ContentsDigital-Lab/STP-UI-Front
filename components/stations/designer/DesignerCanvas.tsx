"use client";

import { Editor, Frame, Element } from "@craftjs/core";
import { BlockPalette }      from "./BlockPalette";
import { PropertiesPanel }   from "./PropertiesPanel";
import { Toolbar }           from "./Toolbar";
import { CanvasContainer }   from "./CanvasContainer";

// ─── Layout ─────────────────────────────────────────────────────────────────
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
    // layout
    CanvasContainer, Section, TwoColumns, Column,
    // content
    Heading, Paragraph, Divider, Spacer, Badge,
    // form
    InputField, SelectField, TextAreaField, ButtonBlock,
    // data
    InfoCard, StatusIndicator,
};

export function DesignerCanvas({ templateName, initialNodes, onSave, saving }: DesignerCanvasProps) {
    return (
        <Editor resolver={RESOLVER}>
            <div className="flex flex-col h-full">
                <Toolbar templateName={templateName} onSave={onSave} saving={saving} />
                <div className="flex flex-1 overflow-hidden">
                    <BlockPalette />

                    {/* Canvas */}
                    <main className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-900/60 p-8">
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

                    <PropertiesPanel />
                </div>
            </div>
        </Editor>
    );
}
