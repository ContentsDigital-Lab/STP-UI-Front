"use client";

import { useEditor } from "@craftjs/core";
import { useState } from "react";
import { Save, Undo2, Redo2, Code2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToolbarProps {
    templateName: string;
    onSave: (craftNodes: Record<string, unknown>) => Promise<void>;
    onDeleteSelected?: () => void;
    saving?: boolean;
}

export function Toolbar({ templateName, onSave, saving }: ToolbarProps) {
    const { actions, query, canUndo, canRedo, selected } = useEditor((state, q) => ({
        canUndo: q.history.canUndo(),
        canRedo: q.history.canRedo(),
        selected: [...state.events.selected][0] ?? null,
    }));

    const [showJson, setShowJson] = useState(false);

    const handleSave = async () => {
        const json = JSON.parse(query.serialize());
        await onSave(json);
    };

    const handleDeleteSelected = () => {
        if (selected) actions.delete(selected);
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

                <div className="flex-1" />

                <Button variant="outline" size="sm" onClick={() => setShowJson(true)} className="h-8 gap-1.5">
                    <Code2 className="h-3.5 w-3.5" />
                    ดู JSON
                </Button>
                <Button size="sm" disabled={saving} onClick={handleSave} className="h-8 gap-1.5">
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "กำลังบันทึก..." : "บันทึก"}
                </Button>
            </header>

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
