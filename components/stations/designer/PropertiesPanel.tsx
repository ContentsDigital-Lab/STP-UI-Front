"use client";

import { useEditor, useNode } from "@craftjs/core";

// Generic text input for a single prop
function PropField({
    label,
    value,
    onChange,
    type = "text",
    placeholder = "",
}: {
    label: string;
    value: string | number | undefined;
    onChange: (v: string) => void;
    type?: string;
    placeholder?: string;
}) {
    return (
        <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                {label}
            </label>
            <input
                type={type}
                value={value ?? ""}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition"
            />
        </div>
    );
}

// Wrapper that reads the selected node and renders its prop fields
function SelectedNodeProps() {
    const { id } = useNode();
    const { actions, nodes } = useEditor((state) => ({
        nodes: state.nodes,
    }));

    const node     = nodes[id];
    const props    = node?.data?.props as Record<string, unknown> ?? {};
    const name     = node?.data?.displayName ?? node?.data?.name ?? "Block";

    const setProp = (key: string, value: string | number) => {
        actions.setProp(id, (p: Record<string, unknown>) => {
            p[key] = value;
        });
    };

    const fields = Object.keys(props).map((key) => {
        const val = props[key];
        const isNumber = typeof val === "number";
        return (
            <PropField
                key={key}
                label={key}
                value={val as string | number | undefined}
                type={isNumber ? "number" : "text"}
                onChange={(v) => setProp(key, isNumber ? Number(v) : v)}
            />
        );
    });

    return (
        <div className="space-y-4 p-4">
            <div>
                <p className="text-xs font-semibold text-foreground">{name}</p>
                <p className="text-[11px] text-muted-foreground">แก้ไข properties</p>
            </div>
            <div className="space-y-3">{fields}</div>
        </div>
    );
}

// Outer panel — shows content only when something is selected
export function PropertiesPanel() {
    const { selected } = useEditor((state) => {
        const selectedIds = [...state.events.selected];
        return { selected: selectedIds[0] ?? null };
    });

    return (
        <aside className="w-60 shrink-0 border-l bg-card flex flex-col overflow-y-auto">
            <div className="px-4 py-3 border-b">
                <h2 className="text-sm font-semibold">Properties</h2>
            </div>
            {selected ? (
                <SelectedNodeWrapper id={selected} />
            ) : (
                <div className="flex-1 flex items-center justify-center p-6">
                    <p className="text-xs text-muted-foreground text-center">
                        คลิกเลือก block<br />เพื่อแก้ไข properties
                    </p>
                </div>
            )}
        </aside>
    );
}

// Helper component: wraps SelectedNodeProps with the correct node context
function SelectedNodeWrapper({ id }: { id: string }) {
    return <NodeContext id={id} />;
}

function NodeContext({ id }: { id: string }) {
    const { actions, nodes } = useEditor((state) => ({ nodes: state.nodes }));

    const node  = nodes[id];
    const props = (node?.data?.props ?? {}) as Record<string, unknown>;
    const name  = node?.data?.displayName ?? node?.data?.name ?? "Block";

    const setProp = (key: string, value: string | number) => {
        actions.setProp(id, (p: Record<string, unknown>) => {
            p[key] = value;
        });
    };

    const fields = Object.keys(props).map((key) => {
        const val = props[key];
        const isNumber = typeof val === "number";
        return (
            <PropField
                key={key}
                label={key}
                value={val as string | number | undefined}
                type={isNumber ? "number" : "text"}
                onChange={(v) => setProp(key, isNumber ? Number(v) : v)}
            />
        );
    });

    return (
        <div className="space-y-4 p-4">
            <div>
                <p className="text-xs font-semibold text-foreground">{name}</p>
                <p className="text-[11px] text-muted-foreground">แก้ไข properties</p>
            </div>
            <div className="space-y-3">{fields}</div>
        </div>
    );
}
