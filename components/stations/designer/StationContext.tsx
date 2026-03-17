"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StationContextValue {
    /** ID of the current station (from URL /stations/[stationId]) */
    stationId:      string | null;
    /** Form fields written by InputField / SelectField / TextAreaField / StationSequencePicker */
    formData:       Record<string, unknown>;
    setField:       (key: string, value: unknown) => void;
    resetForm:      () => void;
    /** Current order data — populated when ?orderId= is in URL */
    orderData:      Record<string, unknown> | null;
    setOrderData:   (data: Record<string, unknown> | null) => void;
    orderId:        string | null;
    /** Current request (บิล) data — populated when ?requestId= is in URL */
    requestData:    Record<string, unknown> | null;
    setRequestData: (data: Record<string, unknown> | null) => void;
    requestId:      string | null;
    /** Row selected by clicking in a RecordList — shared with RecordDetail */
    selectedRecord:    Record<string, unknown> | null;
    setSelectedRecord: (record: Record<string, unknown> | null) => void;
    /**
     * Resolve a dotted path against orderData / requestData / formData.
     *   "order.customer.name"   → orderData.customer.name
     *   "request.customer.name" → requestData.customer.name
     *   "form.notes"            → formData.notes
     */
    resolveVar: (path: string) => string;
}

const StationContext = createContext<StationContextValue>({
    stationId:         null,
    formData:          {},
    setField:          () => {},
    resetForm:         () => {},
    orderData:         null,
    setOrderData:      () => {},
    orderId:           null,
    requestData:       null,
    setRequestData:    () => {},
    requestId:         null,
    selectedRecord:    null,
    setSelectedRecord: () => {},
    resolveVar:        () => "",
});

export const useStationContext = () => useContext(StationContext);

// ── Provider ──────────────────────────────────────────────────────────────────
export function StationProvider({
    children,
    stationId: stationIdProp,
    initialOrderData,
    initialRequestData,
}: {
    children:            ReactNode;
    stationId?:          string | null;
    initialOrderData?:   Record<string, unknown> | null;
    initialRequestData?: Record<string, unknown> | null;
}) {
    const [formData,        setFormData]        = useState<Record<string, unknown>>({});
    const [orderData,       setOrderData]       = useState<Record<string, unknown> | null>(initialOrderData   ?? null);
    const [requestData,     setRequestData]     = useState<Record<string, unknown> | null>(initialRequestData ?? null);
    const [selectedRecord,  setSelectedRecord]  = useState<Record<string, unknown> | null>(null);

    const orderId   = orderData   ? (orderData._id   as string ?? null) : null;
    const requestId = requestData ? (requestData._id as string ?? null) : null;

    const setField  = useCallback((key: string, value: unknown) => {
        if (!key) return;
        setFormData((prev) => ({ ...prev, [key]: value }));
    }, []);

    const resetForm = useCallback(() => setFormData({}), []);

    const resolveVar = useCallback((path: string): string => {
        // form.fieldKey → read from formData
        if (path.startsWith("form.")) {
            const val = formData[path.slice(5)];
            return val != null ? String(val) : "";
        }
        // request.x.y → walk requestData
        if (path.startsWith("request.")) {
            if (!requestData) return "";
            const parts = path.slice(8).split(".");
            let cur: unknown = requestData;
            for (const p of parts) {
                if (!cur || typeof cur !== "object") return "";
                cur = (cur as Record<string, unknown>)[p];
            }
            if (cur == null) return "";
            if (typeof cur === "object") return (cur as Record<string, string>).name ?? JSON.stringify(cur);
            return String(cur);
        }
        // order.x.y or just x.y → walk orderData
        if (!orderData) return "";
        const parts = path.replace(/^order\./, "").split(".");
        let cur: unknown = orderData;
        for (const p of parts) {
            if (!cur || typeof cur !== "object") return "";
            cur = (cur as Record<string, unknown>)[p];
        }
        if (cur == null) return "";
        if (typeof cur === "object") return (cur as Record<string, string>).name ?? JSON.stringify(cur);
        return String(cur);
    }, [formData, orderData, requestData]);

    return (
        <StationContext.Provider value={{
            stationId: stationIdProp ?? null,
            formData, setField, resetForm,
            orderData, setOrderData, orderId,
            requestData, setRequestData, requestId,
            selectedRecord, setSelectedRecord,
            resolveVar,
        }}>
            {children}
        </StationContext.Provider>
    );
}
