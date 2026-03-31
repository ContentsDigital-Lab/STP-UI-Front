"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StationContextValue {
    stationId:      string | null;
    stationName:    string | null;
    formData:       Record<string, unknown>;
    setField:       (key: string, value: unknown) => void;
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
}

const StationContext = createContext<StationContextValue>({
    stationId:         null,
    stationName:       null,
    formData:          {},
    setField:          () => {},
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
    const [orderData,       setOrderData]       = useState<Record<string, unknown> | null>(initialOrderData   ?? null);
    const [requestData,     setRequestData]     = useState<Record<string, unknown> | null>(initialRequestData ?? null);
    const [paneData,        setPaneData]        = useState<Record<string, unknown> | null>(null);
    const [selectedRecord,  setSelectedRecord]  = useState<Record<string, unknown> | null>(initialOrderData ?? null);
    const [refreshCounter,  setRefreshCounter]  = useState(0);
    const [isOrderReleaseStation, setIsOrderReleaseStation] = useState(false);

    useEffect(() => {
        if (initialOrderData && !selectedRecord) setSelectedRecord(initialOrderData);
    }, [initialOrderData, selectedRecord]);

    const triggerRefresh = useCallback(() => setRefreshCounter((n) => n + 1), []);

    const orderId   = orderData   ? (orderData._id   as string ?? null) : null;
    const requestId = requestData ? (requestData._id as string ?? null) : null;
    const paneId    = paneData    ? (paneData._id    as string ?? null) : null;

    const setField  = useCallback((key: string, value: unknown) => {
        if (!key) return;
        setFormData((prev) => ({ ...prev, [key]: value }));
    }, []);

    const resetForm = useCallback(() => setFormData({}), []);

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
            formData, setField, resetForm,
            orderData, setOrderData, orderId,
            requestData, setRequestData, requestId,
            paneData, setPaneData, paneId,
            selectedRecord, setSelectedRecord,
            resolveVar,
            refreshCounter, triggerRefresh,
            isOrderReleaseStation, setIsOrderReleaseStation,
        }}>
            {children}
        </StationContext.Provider>
    );
}
