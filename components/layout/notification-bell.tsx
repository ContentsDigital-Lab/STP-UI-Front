"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Notification } from "@/lib/api/types";
import { notificationsApi } from "@/lib/api/notifications";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { playNotificationSound } from "@/lib/notification-sounds";
import { useAuth } from "@/lib/auth/auth-context";

export function NotificationBell() {
    const { isAuthenticated } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (!isAuthenticated) return;
        notificationsApi.getAll().then((res) => {
            if (res.success) setNotifications(res.data);
        }).catch(() => {});
    }, []);

    const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const refetchNotifications = useCallback(() => {
        if (refetchTimer.current) clearTimeout(refetchTimer.current);
        refetchTimer.current = setTimeout(() => {
            notificationsApi.getAll().then((res) => {
                if (res.success) setNotifications(res.data);
            }).catch(() => {});
        }, 500);
    }, []);

    const handleSocketEvent = useCallback((_event: string, data: unknown) => {
        const notif = data as Notification;
        if (notif?._id) {
            playNotificationSound(notif.priority ?? "medium");
            refetchNotifications();
        }
    }, [refetchNotifications]);

    useWebSocket("me", [], handleSocketEvent);

    const unreadCount = notifications.filter((n) => !n.readStatus).length;

    const handleMarkAsRead = (id: string) => {
        setNotifications((prev) =>
            prev.map((n) => (n._id === id ? { ...n, readStatus: true } : n))
        );
        notificationsApi.markAsRead(id).catch(() => {});
    };

    const handleMarkAllRead = () => {
        const unreadIds = notifications.filter((n) => !n.readStatus).map((n) => n._id);
        if (unreadIds.length === 0) return;
        setNotifications((prev) => prev.map((n) => ({ ...n, readStatus: true })));
        notificationsApi.markAllRead(unreadIds).catch(() => {});
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return date.toLocaleDateString();
    };

    if (!mounted || !isAuthenticated) return null;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted/50 hover:bg-muted transition-colors">
                <Bell className="h-5 w-5 text-foreground" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                )}
                <span className="sr-only">Notifications</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Notifications</span>
                    {unreadCount > 0 && (
                        <button
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleMarkAllRead(); }}
                        >
                            <CheckCheck className="h-3 w-3" />
                            Mark all read
                        </button>
                    )}
                </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                        No notifications
                    </div>
                ) : (
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.map((notif) => (
                            <DropdownMenuItem
                                key={notif._id}
                                className="flex items-start gap-3 p-3 cursor-pointer"
                                onClick={() => !notif.readStatus && handleMarkAsRead(notif._id)}
                            >
                                <div className="mt-0.5 flex-shrink-0">
                                    {notif.readStatus ? (
                                        <Check className="h-4 w-4 text-muted-foreground" />
                                    ) : (
                                        <div className="h-2 w-2 rounded-full bg-blue-500 mt-1" />
                                    )}
                                </div>
                                <div className="flex-1 space-y-1 min-w-0">
                                    <p className={`text-sm font-medium leading-tight ${notif.readStatus ? "text-muted-foreground" : "text-foreground"}`}>
                                        {notif.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        {notif.message}
                                    </p>
                                    <p className="text-xs text-muted-foreground/70">
                                        {formatTime(notif.createdAt)}
                                    </p>
                                </div>
                                {!notif.readStatus && (
                                    <Badge variant="secondary" className="flex-shrink-0 text-[10px] px-1 py-0">
                                        New
                                    </Badge>
                                )}
                            </DropdownMenuItem>
                        ))}
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
