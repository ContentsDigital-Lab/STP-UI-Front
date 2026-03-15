"use client";

import { useNode } from "@craftjs/core";
import { Zap, Send, Navigation, Globe, MessageSquare } from "lucide-react";

const VARIANT_MAP: Record<string, string> = {
    primary: "bg-primary text-primary-foreground",
    outline: "border-2 border-primary text-primary bg-transparent",
    danger:  "bg-red-600 text-white",
    success: "bg-green-600 text-white",
};
const SIZE_MAP = { sm: "px-3 py-1.5 text-xs", md: "px-5 py-2 text-sm", lg: "px-7 py-3 text-base" };

const ACTION_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    "submit-form":   { icon: Send,          label: "Submit Form", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    "navigate":      { icon: Navigation,    label: "Navigate",    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
    "api-call":      { icon: Globe,         label: "API Call",    color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" },
    "show-confirm":  { icon: MessageSquare, label: "Confirm",     color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
};

interface ButtonBlockProps {
    label?:           string;
    variant?:         "primary" | "outline" | "danger" | "success";
    size?:            "sm" | "md" | "lg";
    fullWidth?:       boolean;
    // action binding
    action?:          "none" | "submit-form" | "navigate" | "api-call" | "show-confirm";
    actionEndpoint?:  string;
    actionMethod?:    string;
    navigateTo?:      string;
    confirmText?:     string;
}

export function ButtonBlock({
    label = "ปุ่มกด",
    variant = "primary",
    size = "md",
    fullWidth = false,
    action = "none",
    actionEndpoint = "",
    actionMethod = "POST",
    navigateTo = "",
    confirmText = "",
}: ButtonBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const actionCfg = action && action !== "none" ? ACTION_CONFIG[action] : null;

    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`cursor-grab rounded-xl p-1.5 transition-all space-y-1.5 ${selected ? "ring-2 ring-primary/40 bg-primary/5" : "hover:bg-muted/20"} ${fullWidth ? "w-full" : "inline-flex flex-col"}`}
        >
            {/* Action badge */}
            {actionCfg && (
                <div className="flex items-center gap-1 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${actionCfg.color}`}>
                        <Zap className="h-2.5 w-2.5" />
                        {actionCfg.label}
                        {action === "submit-form" && actionEndpoint ? ` → ${actionMethod} ${actionEndpoint}` : ""}
                        {action === "navigate" && navigateTo ? ` → ${navigateTo}` : ""}
                        {action === "api-call" && actionEndpoint ? ` → ${actionMethod} ${actionEndpoint}` : ""}
                    </span>
                </div>
            )}

            <button
                className={`rounded-lg font-semibold transition-colors pointer-events-none ${VARIANT_MAP[variant] ?? VARIANT_MAP.primary} ${SIZE_MAP[size]} ${fullWidth ? "w-full" : ""}`}
            >
                {label}
            </button>
        </div>
    );
}

ButtonBlock.craft = {
    displayName: "Button",
    props: {
        label: "ปุ่มกด", variant: "primary", size: "md", fullWidth: false,
        action: "none", actionEndpoint: "", actionMethod: "POST",
        navigateTo: "", confirmText: "",
    } as ButtonBlockProps,
};
