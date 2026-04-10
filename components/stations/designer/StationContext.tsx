"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { stationsApi } from "@/lib/api/stations";
import { useWebSocket } from "@/lib/hooks/use-socket";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StationContextValue {
    stationId:      string | null;
    stationName:    string | null;
    isLaminateStation: boolean;
    formData:       Record<string, unknown>;
    fieldLabels:    Record<string, string>;
    setField:       (key: string, value: unknown) => void;
    setFieldLabel:  (key: string, label: string) => void;
    resetForm:      () => void;
    orderData:      Record<string, unknown> | null;
    setOrderData:   (data: Record<string, unknown> | null) => void;
    orderId:        string | null;
    requestData:    Record<string, unknown> | null;
    setRequestData: (data: Record<string, unknown> | null) => void;
    requestId:      string | null;
    paneData:       Record<string, unknown> | null;
    setPaneData:    (data: Record<string, unknown> | null) => void;
    paneId:         string | null;
    selectedRecord:    Record<string, unknown> | null;
    setSelectedRecord: (record: Record<string, unknown> | null) => void;
    resolveVar: (path: string) => string;
    refreshCounter: number;
    triggerRefresh: () => void;
    isOrderReleaseStation: boolean;
    setIsOrderReleaseStation: (v: boolean) => void;
    /** Order id to show first in คิวสถานี (set after scan-in). */
    queueFrontOrderId: string | null;
    pinQueueOrderToFront: (orderId: string) => void;
    /** Clear queue pin when that order no longer has panes at this station. */
    clearQueueFrontOrderId: () => void;
}

const StationContext = createContext<StationContextValue>({
    stationId:         null,
    stationName:       null,
    isLaminateStation: false,
    formData:          {},
    fieldLabels:       {},
    setField:          () => {},
    setFieldLabel:     () => {},
    resetForm:         () => {},
    orderData:         null,
    setOrderData:      () => {},
    orderId:           null,
    requestData:       null,
    setRequestData:    () => {},
    requestId:         null,
    paneData:          null,
    setPaneData:       () => {},
    paneId:            null,
    selectedRecord:    null,
    setSelectedRecord: () => {},
    resolveVar:        () => "",
    refreshCounter:    0,
    triggerRefresh:    () => {},
    isOrderReleaseStation: false,
    setIsOrderReleaseStation: () => {},
    queueFrontOrderId: null,
    pinQueueOrderToFront: () => {},
    clearQueueFrontOrderId: () => {},
});

export const useStationContext = () => useContext(StationContext);

// ── Provider ──────────────────────────────────────────────────────────────────
export function StationProvider({
    children,
    stationId: stationIdProp,
    stationName: stationNameProp,
    initialOrderData,
    initialRequestData,
}: {
    children:            ReactNode;
    stationId?:          string | null;
    stationName?:        string | null;
    initialOrderData?:   Record<string, unknown> | null;
    initialRequestData?: Record<string, unknown> | null;
}) {
    const [formData,        setFormData]        = useState<Record<string, unknown>>({});
    const [fieldLabels,     setFieldLabels]     = useState<Record<string, string>>({});
    const [orderData,       setOrderData]       = useState<Record<string, unknown> | null>(initialOrderData   ?? null);
    const [requestData,     setRequestData]     = useState<Record<string, unknown> | null>(initialRequestData ?? null);
    const [paneData,        setPaneData]        = useState<Record<string, unknown> | null>(null);
    const [selectedRecord,  setSelectedRecord]  = useState<Record<string, unknown> | null>(initialOrderData ?? null);
    const [refreshCounter,  setRefreshCounter]  = useState(0);
    const [queueFrontOrderId, setQueueFrontOrderId] = useState<string | null>(null);
    const [isOrderReleaseStation, setIsOrderReleaseStation] = useState(false);
    const [isLaminateStation, setIsLaminateStation] = useState(false);

    const pinQueueOrderToFront = useCallback((orderId: string) => {
        if (!orderId || orderId === "__unknown__") return;
        setQueueFrontOrderId(orderId);
    }, []);

    const clearQueueFrontOrderId = useCallback(() => {
        setQueueFrontOrderId(null);
    }, []);

    useEffect(() => {
        if (!stationIdProp) return;
        stationsApi.getById(stationIdProp).then(res => {
            if (res.success && res.data?.isLaminateStation) setIsLaminateStation(true);
        }).catch(() => {});
    }, [stationIdProp]);

    useEffect(() => {
        if (initialOrderData && !selectedRecord) setSelectedRecord(initialOrderData);
    }, [initialOrderData, selectedRecord]);

    const triggerRefresh = useCallback(() => setRefreshCounter((n) => n + 1), []);

    const orderId   = orderData   ? ((orderData._id || orderData.id) as string ?? null) : null;
    const requestId = requestData ? ((requestData._id || requestData.id) as string ?? null) : null;
    const paneId    = paneData    ? ((paneData._id || paneData.id) as string ?? null) : null;

    // ── Global Sockets ──────────────────────────────────────────────────────────
    // Listen for updates to the active pane/order and refresh them in real-time
    useWebSocket("pane", ["pane:updated"], (event, data: any) => {
        if (!paneId || !data) return;
        const updatedId = data._id || data.id;
        if (updatedId === paneId) {
            console.log(`[Socket] Syncing active pane: ${paneId}`);
            setPaneData(data);
            
            // If the pane reached a terminal status for this inspection, clear it
            if (["ready", "completed", "cancelled", "claimed"].includes(data.currentStatus)) {
                // Wait a tiny bit then clear to ensure other components see the final state
                setTimeout(() => setPaneData(null), 1500);
            }
        }
        triggerRefresh();
    }, { stationRoom: stationIdProp ?? undefined });

    useWebSocket("order", ["order:updated"], (event, data: any) => {
        if (!orderId || !data) return;
        const updatedId = data._id || data.id;
        if (updatedId === orderId) {
            console.log(`[Socket] Syncing active order: ${orderId}`);
            setOrderData(data);
        }
        triggerRefresh();
    });

    const setField  = useCallback((key: string, value: unknown) => {
        if (!key) return;
        setFormData((prev) => ({ ...prev, [key]: value }));
    }, []);

    const setFieldLabel = useCallback((key: string, label: string) => {
        if (!key) return;
        setFieldLabels((prev) => ({ ...prev, [key]: label }));
    }, []);

    const resetForm = useCallback(() => { setFormData({}); setFieldLabels({}); }, []);

    const walkObject = useCallback((obj: Record<string, unknown>, dotPath: string): string => {
        const parts = dotPath.split(".");
        let cur: unknown = obj;
        for (const p of parts) {
            if (!cur || typeof cur !== "object") return "";
            cur = (cur as Record<string, unknown>)[p];
        }
        if (cur == null) return "";
        if (typeof cur === "object") return (cur as Record<string, string>).name ?? JSON.stringify(cur);
        return String(cur);
    }, []);

    const resolveVar = useCallback((path: string): string => {
        if (path.startsWith("form.")) {
            const val = formData[path.slice(5)];
            return val != null ? String(val) : "";
        }
        if (path.startsWith("request.")) {
            return requestData ? walkObject(requestData, path.slice(8)) : "";
        }
        if (path.startsWith("pane.")) {
            return paneData ? walkObject(paneData, path.slice(5)) : "";
        }
        if (!orderData) return "";
        return walkObject(orderData, path.replace(/^order\./, ""));
    }, [formData, orderData, requestData, paneData, walkObject]);

    return (
        <StationContext.Provider value={{
            stationId: stationIdProp ?? null,
            stationName: stationNameProp ?? null,
            isLaminateStation,
            formData, fieldLabels, setField, setFieldLabel, resetForm,
            orderData, setOrderData, orderId,
            requestData, setRequestData, requestId,
            paneData, setPaneData, paneId,
            selectedRecord, setSelectedRecord,
            resolveVar,
            refreshCounter, triggerRefresh,
            isOrderReleaseStation, setIsOrderReleaseStation,
            queueFrontOrderId, pinQueueOrderToFront, clearQueueFrontOrderId,
        }}>
            {children}
        </StationContext.Provider>
    );
}
