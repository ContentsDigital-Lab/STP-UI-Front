"use client";

import { Editor, Frame, Element } from "@craftjs/core";
import { BlockPalette }     from "./BlockPalette";
import { PropertiesPanel }  from "./PropertiesPanel";
import { Toolbar }          from "./Toolbar";
import { InputBlock }       from "./blocks/InputBlock";
import { CuttingBlock }     from "./blocks/CuttingBlock";
import { GrindingBlock }    from "./blocks/GrindingBlock";
import { ProcessingBlock }  from "./blocks/ProcessingBlock";
import { InspectionBlock }  from "./blocks/InspectionBlock";
import { PackagingBlock }   from "./blocks/PackagingBlock";
import { OutputBlock }      from "./blocks/OutputBlock";
import { NoteBlock }        from "./blocks/NoteBlock";
import { CanvasContainer }  from "./CanvasContainer";

interface DesignerCanvasProps {
    templateName: string;
    initialNodes?: Record<string, unknown>;
    onSave: (craftNodes: Record<string, unknown>) => Promise<void>;
    saving?: boolean;
}

// All blocks must be registered here so Craft.js can deserialize them
const RESOLVER = {
    InputBlock,
    CuttingBlock,
    GrindingBlock,
    ProcessingBlock,
    InspectionBlock,
    PackagingBlock,
    OutputBlock,
    NoteBlock,
    CanvasContainer,
};

export function DesignerCanvas({ templateName, initialNodes, onSave, saving }: DesignerCanvasProps) {
    return (
        <Editor resolver={RESOLVER}>
            <div className="flex flex-col h-full">
                <Toolbar templateName={templateName} onSave={onSave} saving={saving} />
                <div className="flex flex-1 overflow-hidden">
                    <BlockPalette />

                    {/* Main canvas area */}
                    <main className="flex-1 overflow-auto bg-muted/20 p-6">
                        <Frame data={initialNodes ? JSON.stringify(initialNodes) : undefined}>
                            <Element
                                is={CanvasContainer}
                                canvas
                                id="root-canvas"
                                className="min-h-[600px] w-full"
                            />
                        </Frame>
                    </main>

                    <PropertiesPanel />
                </div>
            </div>
        </Editor>
    );
}
