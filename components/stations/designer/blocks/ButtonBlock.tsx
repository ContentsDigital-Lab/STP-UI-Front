"use client";

import { useNode } from "@craftjs/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Zap, Send, Navigation, Globe, MessageSquare, Loader2, CheckCircle2 } from "lucide-react";
import { usePreview } from "../PreviewContext";

const VARIANT_MAP: Record<string, string> = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border-2 border-primary text-primary bg-transparent hover:bg-primary/10",
    danger:  "bg-red-600 text-white hover:bg-red-700",
    success: "bg-green-600 text-white hover:bg-green-700",
};
const SIZE_MAP = { sm: "px-3 py-1.5 text-xs", md: "px-5 py-2 text-sm", lg: "px-7 py-3 text-base" };

const ACTION_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    "submit-form":  { icon: Send,          label: "Submit Form", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    "navigate":     { icon: Navigation,    label: "Navigate",    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
    "api-call":     { icon: Globe,         label: "API Call",    color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300" },
    "show-confirm": { icon: MessageSquare, label: "Confirm",     color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
};

interface ButtonBlockProps {
    label?:          string;
    variant?:        "primary" | "outline" | "danger" | "success";
    size?:           "sm" | "md" | "lg";
    fullWidth?:      boolean;
    align?:          "left" | "center" | "right";
    action?:         "none" | "submit-form" | "navigate" | "api-call" | "show-confirm";
    actionEndpoint?: string;
    actionMethod?:   string;
    navigateTo?:     string;
    confirmText?:    string;
}

const ALIGN_MAP = { left: "justify-start", center: "justify-center", right: "justify-end" };

export function ButtonBlock({
    label = "ปุ่มกด",
    variant = "primary",
    size = "md",
    fullWidth = false,
    align = "left",
    action = "none",
    actionEndpoint = "",
    actionMethod = "POST",
    navigateTo = "",
    confirmText = "",
}: ButtonBlockProps) {
    const { connectors: { connect, drag }, selected } = useNode((s) => ({ selected: s.events.selected }));
    const isPreview  = usePreview();
    const router     = useRouter();
    const [feedback, setFeedback] = useState<"" | "ok" | "loading">("");
    const actionCfg  = action && action !== "none" ? ACTION_CONFIG[action] : null;

    // ── Preview click handler ─────────────────────────────────────────────────
    const handlePreviewClick = async () => {
        if (action === "navigate" && navigateTo) {
            router.push(navigateTo);
            return;
        }
        if (action === "show-confirm") {
            const ok = window.confirm(confirmText || "ต้องการดำเนินการต่อใช่ไหม?");
            if (!ok) return;
            setFeedback("ok");
            setTimeout(() => setFeedback(""), 2000);
            return;
        }
        if ((action === "submit-form" || action === "api-call") && actionEndpoint) {
            setFeedback("loading");
            // Simulate API call delay in preview
            await new Promise((r) => setTimeout(r, 800));
            setFeedback("ok");
            setTimeout(() => setFeedback(""), 2500);
            return;
        }
        // none or missing config — just show a flash
        setFeedback("ok");
        setTimeout(() => setFeedback(""), 1500);
    };

    const alignClass = ALIGN_MAP[align] ?? "justify-start";

    // ── Preview render ────────────────────────────────────────────────────────
    if (isPreview) {
        return (
            <div className={`w-full flex ${alignClass}`}>
                <div className="flex flex-col items-stretch" style={fullWidth ? { width: "100%" } : {}}>
                    <button
                        onClick={handlePreviewClick}
                        disabled={feedback === "loading"}
                        className={`rounded-lg font-semibold transition-all ${VARIANT_MAP[variant] ?? VARIANT_MAP.primary} ${SIZE_MAP[size]} ${fullWidth ? "w-full" : ""} ${feedback === "ok" ? "!bg-green-500 !text-white !border-green-500" : ""} disabled:opacity-70 flex items-center justify-center gap-2`}
                    >
                        {feedback === "loading" ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> กำลังส่ง...</>
                        ) : feedback === "ok" ? (
                            <><CheckCircle2 className="h-4 w-4" /> สำเร็จ</>
                        ) : (
                            label
                        )}
                    </button>
                    {action !== "none" && actionCfg && feedback === "" && (
                        <p className="text-[10px] text-muted-foreground mt-1 text-center">
                            {action === "navigate" && navigateTo ? `→ ${navigateTo}` : ""}
                            {(action === "submit-form" || action === "api-call") && actionEndpoint ? `${actionMethod} ${actionEndpoint}` : ""}
                            {action === "show-confirm" ? "แสดงการยืนยัน" : ""}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // ── Design mode render ────────────────────────────────────────────────────
    return (
        <div
            ref={(ref) => { ref && connect(drag(ref)); }}
            className={`w-full flex ${alignClass} cursor-grab rounded-xl p-1.5 transition-all ${selected ? "ring-2 ring-primary/40 bg-primary/5" : "hover:bg-muted/20"}`}
        >
            <div className="flex flex-col gap-1 items-stretch" style={fullWidth ? { width: "100%" } : {}}>
                {actionCfg && (
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium self-start ${actionCfg.color}`}>
                        <Zap className="h-2.5 w-2.5" />
                        {action === "submit-form" && actionEndpoint ? `ส่งฟอร์ม → ${actionEndpoint}` : ""}
                        {action === "navigate"    && navigateTo      ? `ไปยัง ${navigateTo}` : ""}
                        {action === "api-call"    && actionEndpoint  ? `${actionMethod} ${actionEndpoint}` : ""}
                        {action === "show-confirm"                   ? `ยืนยัน` : ""}
                        {!actionEndpoint && !navigateTo && action !== "show-confirm" ? actionCfg.label : ""}
                    </span>
                )}
                <button className={`rounded-lg font-semibold transition-colors pointer-events-none ${VARIANT_MAP[variant] ?? VARIANT_MAP.primary} ${SIZE_MAP[size]} ${fullWidth ? "w-full" : ""}`}>
                    {label}
                </button>
            </div>
        </div>
    );
}

ButtonBlock.craft = {
    displayName: "Button",
    props: {
        label: "ปุ่มกด", variant: "primary", size: "md", fullWidth: false, align: "left",
        action: "none", actionEndpoint: "", actionMethod: "POST",
        navigateTo: "", confirmText: "",
    } as ButtonBlockProps,
};
