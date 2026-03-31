"use client";

import { useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { toast } from "sonner";
import { useLanguage } from "@/lib/i18n/language-context";
import { AlertTriangle } from "lucide-react";
import React from "react";

export function GlobalNotificationListener() {
    const { user, isAuthenticated } = useAuth();
    const { t, lang } = useLanguage();

    const playAlertSound = useCallback(() => {
        try {
            // Using a professional notification sound URL as a fallback, 
            // or we can use a synthesized beep for reliability.
            const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
            audio.volume = 0.5;
            audio.play().catch(e => console.warn("Audio playback failed (browser policy):", e));
        } catch (error) {
            console.error("Failed to play alert sound:", error);
        }
    }, []);

    const handleLowStock = useCallback((data: any) => {
        // Only managers and admins should get these global alerts
        const isAuthorized = user?.role === "admin" || user?.role === "manager";
        if (!isAuthorized) return;

        const itemName = data?.name || (lang === "th" ? "สินค้า" : "Item");
        const quantity = data?.quantity ?? "?";
        
        const message = lang === "th" 
            ? `${itemName} ใกล้หมด! เหลือเพียง ${quantity}`
            : `${itemName} is low! Only ${quantity} left.`;

        // Visual Toast
        toast.error(message, {
            description: lang === "th" ? "โปรดตรวจสอบสต็อกและสั่งเติมสินค้า" : "Please check inventory and restock.",
            duration: 10000,
            icon: <AlertTriangle className="h-5 w-5 text-red-500" />,
        });

        // Audible Alert
        playAlertSound();
    }, [user, lang, playAlertSound]);

    // Connect to the inventory room to listen for low stock events globally
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

    // Support for local simulation (for testing/demo)
    useEffect(() => {
        const handleSimulate = (e: any) => {
            handleLowStock(e.detail);
        };
        window.addEventListener('simulate-low-stock' as any, handleSimulate);
        return () => window.removeEventListener('simulate-low-stock' as any, handleSimulate);
    }, [handleLowStock]);

    return null; // This is a logic-only component
}
