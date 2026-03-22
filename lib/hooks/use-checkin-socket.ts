import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { API_BASE_URL } from "../api/config";

interface CheckinEvent {
    worker: string;
    time: string;
}

/**
 * Socket.IO hook for worker check-in at stations.
 * Uses the backend's check-in events: join-station, mobile-scan, scan-confirmed.
 */
export function useCheckinSocket(stationName: string | null) {
    const [connected, setConnected] = useState(false);
    const [lastCheckin, setLastCheckin] = useState<CheckinEvent | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const onCheckinRef = useRef<((data: CheckinEvent) => void) | null>(null);

    useEffect(() => {
        if (!stationName) return;

        const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : "";
        const baseUrl = API_BASE_URL.replace("/api", "");

        const socket = io(baseUrl, {
            path: "/api/socket-entry",
            auth: { token },
            transports: ["websocket"],
            reconnectionAttempts: 5,
            reconnectionDelay: 3000,
        });

        socketRef.current = socket;

        socket.on("connect", () => {
            setConnected(true);
            socket.emit("join-station", stationName);
        });

        socket.on("scan-confirmed", (data: CheckinEvent) => {
            setLastCheckin(data);
            onCheckinRef.current?.(data);
        });

        socket.on("disconnect", () => setConnected(false));
        socket.on("connect_error", () => setConnected(false));

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [stationName]);

    const emitMobileScan = useCallback(
        (worker: string) => {
            if (!socketRef.current || !stationName) return;
            socketRef.current.emit("mobile-scan", { stationId: stationName, worker });
        },
        [stationName],
    );

    const onCheckin = useCallback((cb: (data: CheckinEvent) => void) => {
        onCheckinRef.current = cb;
    }, []);

    return { connected, lastCheckin, emitMobileScan, onCheckin };
}
