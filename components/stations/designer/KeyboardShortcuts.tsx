"use client";

import { useEffect } from "react";
import { useEditor } from "@craftjs/core";

/** Keyboard shortcuts inside the Craft.js Editor context.
 *  Cmd/Ctrl+Z  → undo
 *  Cmd/Ctrl+Shift+Z / Ctrl+Y → redo
 *  Delete / Backspace → delete selected block
 *  Escape → deselect
 */
export function KeyboardShortcuts() {
    const { actions, query, selected } = useEditor((state) => ({
        selected: [...state.events.selected][0] ?? null,
    }));

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement).tagName;
            if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

            const mod = navigator.platform.includes("Mac") ? e.metaKey : e.ctrlKey;

            if (mod && !e.shiftKey && e.key === "z") {
                e.preventDefault();
                actions.history.undo();
            } else if (mod && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
                e.preventDefault();
                actions.history.redo();
            } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
                e.preventDefault();
                const node = query.node(selected).get();
                if (node?.data?.parent) actions.delete(selected);
            } else if (e.key === "Escape") {
                actions.selectNode(undefined as unknown as string);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [actions, query, selected]);

    return null;
}
