"use client";

import { useState, useEffect, useCallback } from "react";
import { paneLogsApi } from "@/lib/api/pane-logs";
import { PaneLog } from "@/lib/api/types";

export interface StationAverage {
    stationId: string;
    averageMs: number;
    totalAreaSqm: number;
    count: number;
}

export interface MaterialStats {
    materialId: string;
    averages: Record<string, StationAverage>; // stationId -> stats
}

export interface ProductionStatsResult {
    stats: Record<string, MaterialStats>;
    accuracy: number; // 0-100 percentage
}

export function useProductionStats() {
    const [stats, setStats] = useState<Record<string, MaterialStats>>({});
    const [accuracy, setAccuracy] = useState<number>(0);
    const [loading, setLoading] = useState(false);

    const refreshStats = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch a large number of logs to calculate averages
            const res = await paneLogsApi.getAll({ limit: 1000 });
            if (!res.success || !res.data) return;

            const logs = res.data;
            const paneDurations: Record<string, Record<string, { start?: number; complete?: number; materialId?: string; area?: number }>> = {};

            // Group logs by pane and station
            logs.forEach(log => {
                const paneObj = typeof log.pane === "object" ? log.pane : null;
                const paneId = paneObj ? paneObj._id : (log.pane as string);
                const stationId = typeof log.station === "string" ? log.station : (log.station as any)?._id;
                const materialId = typeof log.material === "string" ? log.material : (log.material as any)?._id;

                if (!paneId || !stationId) return;

                if (!paneDurations[paneId]) paneDurations[paneId] = {};
                
                // Extract dimensions if available
                let area = 0;
                if (paneObj?.dimensions) {
                    area = (paneObj.dimensions.width / 1000) * (paneObj.dimensions.height / 1000);
                }

                if (!paneDurations[paneId][stationId]) {
                    paneDurations[paneId][stationId] = { materialId, area };
                } else if (area > 0) {
                    paneDurations[paneId][stationId].area = area;
                }

                const ts = new Date(log.createdAt).getTime();
                if (log.action === "start") {
                    paneDurations[paneId][stationId].start = ts;
                } else if (log.action === "complete") {
                    paneDurations[paneId][stationId].complete = ts;
                }
            });

            const newStats: Record<string, MaterialStats> = {};

            // Calculate durations, area throughput, and averages
            Object.values(paneDurations).forEach(stationMap => {
                Object.entries(stationMap).forEach(([stationId, data]) => {
                    if (data.start && data.complete && data.materialId) {
                        const duration = data.complete - data.start;
                        const matId = data.materialId;
                        const area = data.area || 0;

                        if (!newStats[matId]) {
                            newStats[matId] = { materialId: matId, averages: {} };
                        }

                        if (!newStats[matId].averages[stationId]) {
                            newStats[matId].averages[stationId] = { stationId, averageMs: 0, totalAreaSqm: 0, count: 0 };
                        }

                        const s = newStats[matId].averages[stationId];
                        s.averageMs = (s.averageMs * s.count + duration) / (s.count + 1);
                        s.totalAreaSqm += area;
                        s.count += 1;
                    }
                });
            });

            setStats(newStats);

            // Second pass to calculate accuracy (how close each log was to the final average)
            let totalDeviationScore = 0;
            let count = 0;
            
            Object.values(paneDurations).forEach(stationMap => {
                Object.entries(stationMap).forEach(([stationId, data]) => {
                    if (data.start && data.complete && data.materialId) {
                        const duration = data.complete - data.start;
                        const avg = newStats[data.materialId]?.averages[stationId]?.averageMs;
                        
                        if (avg && avg > 0) {
                            const error = Math.abs(duration - avg) / avg;
                            totalDeviationScore += Math.max(0, 1 - error);
                            count++;
                        }
                    }
                });
            });

            setAccuracy(count > 0 ? (totalDeviationScore / count) * 100 : 0);
        } catch (error) {
            console.error("Failed to fetch production stats:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshStats();
    }, [refreshStats]);

    return { stats, accuracy, loading, refreshStats };
}
