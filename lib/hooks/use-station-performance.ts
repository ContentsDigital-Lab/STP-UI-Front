"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { paneLogsApi } from "@/lib/api/pane-logs";
import { PaneLog } from "@/lib/api/types";

export interface PerformancePoint {
    timestamp: string;
    durationMs: number;
    paneNumber: string;
    label: string; // Formatted date/time for chart
}

export function useStationPerformance(stationId: string | null) {
    const [logs, setLogs] = useState<PaneLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchPerformance = useCallback(async () => {
        if (!stationId) return;
        setLoading(true);
        setError(null);
        try {
            // Fetch last 100 logs for this station to analyze speed trend
            const res = await paneLogsApi.getAll({ 
                station: stationId, 
                limit: 100 
            });
            
            if (res.success && res.data) {
                setLogs(res.data);
            } else {
                setError(res.message || "Failed to fetch station logs");
            }
        } catch (err) {
            setError("Network error fetching performance data");
        } finally {
            setLoading(false);
        }
    }, [stationId]);

    useEffect(() => {
        fetchPerformance();
    }, [fetchPerformance]);

    const performanceData = useMemo(() => {
        if (!logs.length) return [];

        const points: PerformancePoint[] = [];
        const paneMap: Record<string, { start?: number; complete?: number; paneNumber?: string }> = {};

        // Group by paneId to calculate durations
        logs.forEach(log => {
            const paneObj = typeof log.pane === "object" ? log.pane : null;
            const paneId = paneObj ? paneObj._id : (log.pane as string);
            if (!paneId) return;

            if (!paneMap[paneId]) {
                paneMap[paneId] = { paneNumber: paneObj?.paneNumber || "—" };
            }

            const ts = new Date(log.createdAt).getTime();
            if (log.action === "start") paneMap[paneId].start = ts;
            if (log.action === "complete") paneMap[paneId].complete = ts;
        });

        // Filter for completed cycles and format for chart
        Object.entries(paneMap)
            .filter(([_, data]) => data.start && data.complete)
            .forEach(([_, data]) => {
                const completedAt = new Date(data.complete!);
                points.push({
                    timestamp: completedAt.toISOString(),
                    durationMs: data.complete! - data.start!,
                    paneNumber: data.paneNumber || "—",
                    label: completedAt.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
                });
            });

        // Sort by time
        return points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }, [logs]);

    const stats = useMemo(() => {
        if (!performanceData.length) return null;
        
        const durations = performanceData.map(p => p.durationMs);
        const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
        const best = Math.min(...durations);
        const worst = Math.max(...durations);

        return {
            averageMinutes: Math.round(avg / 1000 / 60 * 10) / 10,
            bestMinutes: Math.round(best / 1000 / 60 * 10) / 10,
            worstMinutes: Math.round(worst / 1000 / 60 * 10) / 10,
            totalProcessed: performanceData.length,
            lastUpdated: new Date().toISOString()
        };
    }, [performanceData]);

    return { 
        performanceData, 
        stats, 
        loading, 
        error, 
        refresh: fetchPerformance 
    };
}
