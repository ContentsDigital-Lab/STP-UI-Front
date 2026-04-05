"use client";

import { useState, useEffect, useCallback } from "react";
import { paneLogsApi } from "@/lib/api/pane-logs";
import { PaneLog } from "@/lib/api/types";

export interface StationAverage {
    stationId: string;
    averageMs: number;
    count: number;
}

export interface MaterialStats {
    materialId: string;
    averages: Record<string, StationAverage>; // stationId -> stats
}

export function useProductionStats() {
    const [stats, setStats] = useState<Record<string, MaterialStats>>({});
    const [loading, setLoading] = useState(false);

    const refreshStats = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch a large number of logs to calculate averages
            // In a real production system, this should be done on the backend
            const res = await paneLogsApi.getAll({ limit: 1000 });
            if (!res.success || !res.data) return;

            const logs = res.data;
            const paneDurations: Record<string, Record<string, { start?: number; complete?: number; materialId?: string }>> = {};

            // Group logs by pane and station
            logs.forEach(log => {
                const paneId = typeof log.pane === "string" ? log.pane : log.pane._id;
                const stationId = typeof log.station === "string" ? log.station : log.station._id;
                const materialId = typeof log.material === "string" ? log.material : (log.material as any)?._id;

                if (!paneId || !stationId) return;

                if (!paneDurations[paneId]) paneDurations[paneId] = {};
                if (!paneDurations[paneId][stationId]) paneDurations[paneId][stationId] = { materialId };

                const ts = new Date(log.createdAt).getTime();
                if (log.action === "start") {
                    paneDurations[paneId][stationId].start = ts;
                } else if (log.action === "complete") {
                    paneDurations[paneId][stationId].complete = ts;
                }
            });

            const newStats: Record<string, MaterialStats> = {};

            // Calculate durations and averages
            Object.values(paneDurations).forEach(stationMap => {
                Object.entries(stationMap).forEach(([stationId, data]) => {
                    if (data.start && data.complete && data.materialId) {
                        const duration = data.complete - data.start;
                        const matId = data.materialId;

                        if (!newStats[matId]) {
                            newStats[matId] = { materialId: matId, averages: {} };
                        }

                        if (!newStats[matId].averages[stationId]) {
                            newStats[matId].averages[stationId] = { stationId, averageMs: 0, count: 0 };
                        }

                        const s = newStats[matId].averages[stationId];
                        s.averageMs = (s.averageMs * s.count + duration) / (s.count + 1);
                        s.count += 1;
                    }
                });
            });

            setStats(newStats);
        } catch (error) {
            console.error("Failed to fetch production stats:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshStats();
    }, [refreshStats]);

    return { stats, loading, refreshStats };
}
