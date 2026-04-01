"use client";

import { useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n/language-context";
import { AlertTriangle } from "lucide-react";
import { isManagerOrAbove } from "@/lib/auth/role-utils";
import React from "react";

function ActiveListener() {
    const { user } = useAuth();
    const { lang } = useLanguage();

    const playAlertSound = useCallback(() => {
        try {
            const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
            audio.volume = 0.5;
            audio.play().catch(e => console.warn("Audio playback failed (browser policy):", e));
        } catch (error) {
            console.error("Failed to play alert sound:", error);
        }
    }, []);

    const handleLowStock = useCallback((data: any) => {
        const isAuthorized = isManagerOrAbove(user?.role);
        if (!isAuthorized) return;

        const itemName = data?.name || (lang === "th" ? "สินค้า" : "Item");
        const quantity = data?.quantity ?? "?";
        
        const message = lang === "th" 
            ? `${itemName} ใกล้หมด! เหลือเพียง ${quantity}`
            : `${itemName} is low! Only ${quantity} left.`;

        toast.error(message, {
            description: lang === "th" ? "โปรดตรวจสอบสต็อกและสั่งเติมสินค้า" : "Please check inventory and restock.",
            duration: 10000,
            icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
        });

        playAlertSound();
    }, [user, lang, playAlertSound]);

    useWebSocket(
        "inventory", 
        ["inventory:low_stock", "system_alert"], 
        (event, data) => {
            if (event === "inventory:low_stock") {
                handleLowStock(data);
            } else if (event === "system_alert" && (data as any)?.type === "low_stock") {
                handleLowStock(data);
            }
        }
    );

    useEffect(() => {
        const handleSimulate = (e: any) => {
            handleLowStock(e.detail);
        };
        window.addEventListener('simulate-low-stock' as any, handleSimulate);
        return () => window.removeEventListener('simulate-low-stock' as any, handleSimulate);
    }, [handleLowStock]);

    return null;
}

export function GlobalNotificationListener() {
    const { isAuthenticated } = useAuth();

    if (!isAuthenticated) return null;

    return <ActiveListener />;
}
