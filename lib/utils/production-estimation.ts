import { Order, Pane, Material } from "@/lib/api/types";
import { MaterialStats } from "@/lib/hooks/use-production-stats";

export interface EstimationResult {
    projectedCompletion: Date;
    remainingTimeMs: number;
    delayMs: number;
    isDelayed: boolean;
    confidence: number; // 0-1 based on how many averages were found
}

/**
 * Calculates the projected completion date for an order based on its panes'
 * current progress and historical station performance data.
 */
export function calculateOrderEstimation(
    order: Order,
    panes: Pane[],
    stats: Record<string, MaterialStats>
): EstimationResult {
    const now = new Date();
    const materialId = typeof order.material === "string" ? order.material : order.material?._id;
    const materialStats = materialId ? stats[materialId] : null;

    let maxRemainingMs = 0;
    let totalStatsFound = 0;
    let totalPossibleStats = 0;

    panes.forEach(pane => {
        if (pane.currentStatus === "claimed") return; // Skip finished panes

        const routing = pane.routing || [];
        const currentStationId = typeof pane.currentStation === "object" ? pane.currentStation?._id : pane.currentStation;
        
        // Find index of current station in routing
        const currentIndex = routing.findIndex(rs => {
            const rsId = typeof rs === "string" ? rs : rs._id;
            return rsId === currentStationId;
        });

        // Stations remaining include the current one (if not scan_out) and all subsequent ones
        const remainingStations = currentIndex === -1 
            ? routing // If not at a routed station, assume all routing is left
            : routing.slice(currentIndex);

        let paneRemainingMs = 0;
        remainingStations.forEach(rs => {
            const rsId = typeof rs === "string" ? rs : rs._id;
            totalPossibleStats++;
            
            // Try to find historical average for this material at this station
            const avgMs = materialStats?.averages[rsId]?.averageMs;
            if (avgMs) {
                paneRemainingMs += avgMs;
                totalStatsFound++;
            } else {
                // Fallback: If no material-specific average, maybe use a global default of 15m?
                // For now, we'll just skip to keep it strictly data-driven
            }
        });

        // Adjust current station specifically: If in_progress, maybe subtract time already spent?
        // (Hard to know without startedAt, which we do have for some panes)
        if (pane.currentStatus === "in_progress" && pane.startedAt) {
            const spent = now.getTime() - new Date(pane.startedAt).getTime();
            paneRemainingMs = Math.max(0, paneRemainingMs - spent);
        }

        if (paneRemainingMs > maxRemainingMs) {
            maxRemainingMs = paneRemainingMs;
        }
    });

    const projectedCompletion = new Date(now.getTime() + maxRemainingMs);
    
    // Calculate delay relative to order request deadline
    const orderRequest = typeof order.request === "object" ? order.request : null;
    const deadline = orderRequest?.deadline ? new Date(orderRequest.deadline) : null;
    
    let delayMs = 0;
    let isDelayed = false;
    if (deadline) {
        delayMs = projectedCompletion.getTime() - deadline.getTime();
        isDelayed = delayMs > 0;
    }

    return {
        projectedCompletion,
        remainingTimeMs: maxRemainingMs,
        delayMs,
        isDelayed,
        confidence: totalPossibleStats > 0 ? totalStatsFound / totalPossibleStats : 0
    };
}
