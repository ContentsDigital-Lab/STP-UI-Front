"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock,
  Package,
  ArrowRight,
  ClipboardList,
  Timer,
  Users,
  Zap,
  BarChart3,
  Activity,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import Link from "next/link";
import {
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { useWebSocket } from "@/lib/hooks/use-socket";
import { requestsApi } from "@/lib/api/requests";
import { ordersApi } from "@/lib/api/orders";
import { inventoriesApi } from "@/lib/api/inventories";
import { materialsApi } from "@/lib/api/materials";
import { materialLogsApi } from "@/lib/api/material-logs";
import { OrderRequest, Order, Inventory, Material, MaterialLog } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { ProductionAnalytics } from "@/components/analytics/ProductionAnalytics";

function getDayLabel(date: Date) {
  return date.toLocaleDateString("th-TH", { weekday: "short" });
}
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function DashboardPage() {
  const { t, lang } = useLanguage();
  const { user } = useAuth();

  const [allRequests, setAllRequests] = useState<OrderRequest[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [allInventories, setAllInventories] = useState<Inventory[]>([]);
  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [allLogs, setAllLogs] = useState<MaterialLog[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [chartRange, setChartRange] = useState<"1d" | "7d" | "30d">("7d");

  useEffect(() => {
    // Slight delay ensures the CSS transition triggers smoothly
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const fetchLiveData = useCallback(async () => {
    try {
      const [rRes, oRes, iRes, mRes, lRes] = await Promise.all([
        requestsApi.getAll(),
        ordersApi.getAll(),
        inventoriesApi.getAll(),
        materialsApi.getAll(),
        materialLogsApi.getAll(),
      ]);
      if (rRes.success && rRes.data) setAllRequests(rRes.data);
      if (oRes.success && oRes.data) setAllOrders(oRes.data);
      if (iRes.success && iRes.data) setAllInventories(iRes.data);
      if (mRes.success && mRes.data) setAllMaterials(mRes.data);
      if (lRes.success && lRes.data) setAllLogs(lRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setDataLoaded(true);
    }
  }, []);
  useEffect(() => {
    fetchLiveData();
  }, [fetchLiveData]);

  useWebSocket(
    "dashboard",
    [
      "order:updated",
      "inventory:updated",
      "log:updated",
      "request:updated",
      "withdrawal:updated",
      "claim:updated",
    ],
    () => fetchLiveData(),
  );

  const analytics = useMemo(() => {
    const now = new Date();

    const isToday = chartRange === "1d";
    const dayCount = chartRange === "30d" ? 30 : 7;

    type Bucket = { label: string; count: number; date: Date; hourStart?: number };
    const days: Bucket[] = [];

    if (isToday) {
      for (let h = 0; h < 24; h++) {
        const d = new Date(now);
        d.setHours(h, 0, 0, 0);
        days.push({ label: `${String(h).padStart(2, "0")}:00`, count: 0, date: d, hourStart: h });
      }
    } else {
      for (let i = dayCount - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const label = dayCount <= 7
          ? getDayLabel(d)
          : d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
        days.push({ label, count: 0, date: d });
      }
    }

    const matchBucket = (ts: Date) => {
      if (isToday) {
        if (!isSameDay(ts, now)) return undefined;
        return days.find((d) => d.hourStart === ts.getHours());
      }
      return days.find((d) => isSameDay(d.date, ts));
    };

    allRequests.forEach((r) => {
      const slot = matchBucket(new Date(r.createdAt));
      if (slot) slot.count++;
    });

    const pending = allRequests.filter((r) => !r.assignedTo).length;
    const threeDays = new Date(now);
    threeDays.setDate(threeDays.getDate() + 3);
    const approaching = allRequests.filter((r) => {
      if (!r.deadline) return false;
      const dl = new Date(r.deadline);
      return dl >= now && dl <= threeDays;
    }).length;

    const totalOrders = allOrders.length;
    const completedOrders = allOrders.filter(
      (o) => o.status === "completed",
    ).length;
    const completionRate =
      totalOrders > 0
        ? Math.round((completedOrders / totalOrders) * 100)
        : 0;

    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const thisWeek = allRequests.filter(
      (r) => new Date(r.createdAt) >= weekAgo,
    ).length;
    const lastWeek = allRequests.filter((r) => {
      const d = new Date(r.createdAt);
      return d >= twoWeeksAgo && d < weekAgo;
    }).length;
    const trendPct =
      lastWeek > 0
        ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
        : thisWeek > 0
          ? 100
          : 0;

    const inProgress = allOrders.filter(
      (o) => o.status === "in_progress",
    ).length;
    const pendingOrders = allOrders.filter(
      (o) => o.status === "pending",
    ).length;

    const totalStock = allInventories.reduce((sum, inv) => sum + inv.quantity, 0);

    const stockByMaterial: Record<string, number> = {};
    allInventories.forEach((inv) => {
      if (!inv.material) return;
      const matId = typeof inv.material === "string" ? inv.material : inv.material._id;
      stockByMaterial[matId] = (stockByMaterial[matId] || 0) + inv.quantity;
    });
    let lowStockAlerts = 0;
    allMaterials.forEach((m) => {
      if ((stockByMaterial[m._id] || 0) <= m.reorderPoint) {
        lowStockAlerts++;
      }
    });

    const chartDataMap: Record<string, { stock: number; out: number }> = {};
    days.forEach(d => {
      chartDataMap[d.label] = { stock: 0, out: 0 };
    });

    allLogs.forEach((log) => {
      const slot = matchBucket(new Date(log.createdAt));
      if (slot) {
        if (log.actionType === "import") {
          chartDataMap[slot.label].stock += Math.abs(log.quantityChanged);
        } else {
          chartDataMap[slot.label].out += Math.abs(log.quantityChanged);
        }
      }
    });

    const chartData = days.map((d) => ({
      name: d.label,
      stock: chartDataMap[d.label].stock,
      out: chartDataMap[d.label].out,
    }));

    const sortedLogs = [...allLogs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const recentActivity = sortedLogs.slice(0, 5).map(log => {
      let materialName = "Unknown";
      if (typeof log.material === "object") materialName = log.material.name;
      else {
         const m = allMaterials.find(mat => mat._id === log.material);
         if (m) materialName = m.name;
      }

      let userName = "System";
      if (log.worker && typeof log.worker === "object") userName = log.worker.name || log.worker.username;
      
      const timeDiffMs = new Date().getTime() - new Date(log.createdAt).getTime();
      const mins = Math.floor(timeDiffMs / 60000);
      const hrs = Math.floor(mins / 60);
      const timeStr = hrs > 24 ? `${Math.floor(hrs / 24)}${lang === "th" ? "วัน" : "d"}` : hrs > 0 ? `${hrs}${lang === "th" ? "ชม." : "h"}` : `${mins}${lang === "th" ? "นาที" : "m"}`;

      return {
         type: log.actionType,
         material: materialName,
         qty: log.actionType === "import" ? `+${Math.abs(log.quantityChanged)}` : `-${Math.abs(log.quantityChanged)}`,
         time: timeStr,
         user: userName,
      };
    });

    return {
      days,
      pending,
      approaching,
      completionRate,
      thisWeek,
      trendPct,
      inProgress,
      pendingOrders,
      totalOrders,
      completedOrders,
      totalStock,
      lowStockAlerts,
      chartData,
      recentActivity
    };
  }, [allRequests, allOrders, allInventories, allMaterials, allLogs, lang, chartRange]);

  // The chart data and recent activities are now computed dynamically inside `analytics`

  return (
    <div className={`space-y-6 max-w-[1440px] mx-auto transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            {t.dashboard.welcome}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {lang === "th"
              ? "ภาพรวมระบบจัดการการผลิตกระจก"
              : "Glass manufacturing overview"}
          </p>
        </div>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: t.dashboard.total_stock,
            value: dataLoaded ? analytics.totalStock.toLocaleString() : "...",
            change: "",
            positive: true,
            icon: Boxes,
            accent: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",
          },
          {
            label: t.dashboard.low_stock_alerts,
            value: dataLoaded ? analytics.lowStockAlerts.toString() : "...",
            change: "",
            positive: analytics.lowStockAlerts === 0,
            icon: AlertTriangle,
            accent: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
          },
          {
            label: t.dashboard.pending_requests,
            value: dataLoaded ? analytics.pending.toString() : "...",
            change: "",
            positive: false,
            icon: Clock,
            accent: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10",
          },
          {
            label: t.dashboard.completed_today,
            value: dataLoaded ? analytics.completedOrders.toString() : "...",
            change: "",
            positive: true,
            icon: CheckCircle2,
            accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
          },
        ].map((kpi, i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 p-4 sm:p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${kpi.accent}`}>
                <kpi.icon className="h-[18px] w-[18px]" />
              </div>
              <span
                className={`text-xs font-semibold ${
                  kpi.positive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-500 dark:text-red-400"
                }`}
              >
                {kpi.change}
              </span>
            </div>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-0.5">
              {kpi.label}
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      {/* ── Charts Row ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Area Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 p-5">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white">
                {t.dashboard.inventory_flow}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {chartRange === "1d"
                  ? (lang === "th" ? "ยอดสต็อก vs เบิกออก รายชั่วโมง (วันนี้)" : "Hourly stock vs outgoing (today)")
                  : (lang === "th" ? "ยอดสต็อก vs เบิกออก รายวัน" : "Daily stock vs outgoing")}
              </p>
            </div>
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              {(["1d", "7d", "30d"] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setChartRange(range)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    chartRange === range
                      ? "text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-700 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-700"
                  }`}
                >
                  {range === "1d" ? (lang === "th" ? "วันนี้" : "Today") : range.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dataLoaded ? analytics.chartData : []}>
                <defs>
                  <linearGradient id="gStock" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} width={40} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 12px -2px rgba(0,0,0,0.06)",
                    fontSize: "12px",
                  }}
                />
                <Area type="monotone" dataKey="stock" stroke="#2563eb" strokeWidth={2} fill="url(#gStock)" />
                <Area type="monotone" dataKey="out" stroke="#f59e0b" strokeWidth={2} fill="url(#gOut)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-5 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="size-2.5 rounded-full bg-blue-600" />
              Stock
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="size-2.5 rounded-full bg-amber-500" />
              Outgoing
            </div>
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 p-5 flex flex-col">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-1">
            {t.dashboard.recent_activity}
          </h2>
          <p className="text-xs text-slate-400 mb-5">
            {lang === "th" ? "ความเคลื่อนไหวล่าสุด" : "Latest movements"}
          </p>
          <div className="flex-1 space-y-1">
            {dataLoaded && analytics.recentActivity.map((a, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div
                  className={`h-8 w-8 rounded-lg shrink-0 flex items-center justify-center ${
                    a.type === "import"
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                      : "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                  }`}
                >
                  {a.type === "import" ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300 truncate">
                    {a.material}
                  </p>
                  <p className="text-[11px] text-slate-400">{a.user} · {a.time}</p>
                </div>
                <span
                  className={`text-xs font-semibold shrink-0 ${
                    a.type === "import"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}
                >
                  {a.qty}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/logs"
            className="mt-3 flex items-center justify-center gap-1.5 h-9 rounded-lg text-[13px] font-medium text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            {lang === "th" ? "ดูทั้งหมด" : "View all"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* ── Request Analytics ───────────────────────────────── */}
      {dataLoaded && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Bar Chart */}
          <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 p-5">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  {lang === "th" ? "คำขอเข้าใหม่ (7 วัน)" : "New Requests (7 days)"}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {lang === "th" ? "จำนวนคำสั่งซื้อรายวัน" : "Daily order requests"}
                </p>
              </div>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-md ${
                  analytics.trendPct >= 0
                    ? "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10"
                    : "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10"
                }`}
              >
                {analytics.trendPct >= 0 ? "+" : ""}
                {analytics.trendPct}%
              </span>
            </div>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.days} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#94a3b8" }} allowDecimals={false} width={30} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "10px",
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 12px -2px rgba(0,0,0,0.06)",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [`${value}`, lang === "th" ? "รายการ" : "requests"]}
                  />
                  <Bar dataKey="count" radius={[6, 6, 2, 2]}>
                    {analytics.days.map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={idx === analytics.days.length - 1 ? "#2563eb" : "#e2e8f0"}
                        className={idx === analytics.days.length - 1 ? "dark:fill-blue-500" : "dark:fill-slate-700"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Mini KPIs */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-3 content-start">
            {[
              {
                label: lang === "th" ? "รออนุมัติ" : "Pending",
                value: analytics.pending,
                sub: lang === "th" ? "รายการ" : "items",
                icon: Timer,
                accent: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
              },
              {
                label: lang === "th" ? "ใกล้ Deadline" : "Due Soon",
                value: analytics.approaching,
                sub: lang === "th" ? "ภายใน 3 วัน" : "within 3 days",
                icon: AlertTriangle,
                accent: analytics.approaching > 0
                  ? "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10"
                  : "text-slate-400 bg-slate-100 dark:bg-slate-800",
                danger: analytics.approaching > 0,
              },
              {
                label: lang === "th" ? "อัตราสำเร็จ" : "Completion",
                value: `${analytics.completionRate}%`,
                sub: `${analytics.completedOrders}/${analytics.totalOrders}`,
                icon: Zap,
                accent: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
              },
              {
                label: lang === "th" ? "กำลังผลิต" : "In Progress",
                value: analytics.inProgress,
                sub: `+${analytics.pendingOrders} ${lang === "th" ? "รอคิว" : "queued"}`,
                icon: Users,
                accent: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",
              },
            ].map((m, i) => (
              <div
                key={i}
                className={`bg-white dark:bg-slate-900 p-4 rounded-xl border ${
                  m.danger
                    ? "border-red-200 dark:border-red-900/40"
                    : "border-slate-200/60 dark:border-slate-800"
                }`}
              >
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center mb-3 ${m.accent}`}>
                  <m.icon className="h-4 w-4" />
                </div>
                <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-0.5">
                  {m.label}
                </p>
                <p
                  className={`text-2xl font-bold tracking-tight leading-none ${
                    m.danger
                      ? "text-red-600 dark:text-red-400"
                      : "text-slate-900 dark:text-white"
                  }`}
                >
                  {m.value}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">{m.sub}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Production Analytics ─────────────────────────────── */}
      <div className="mt-4">
        <ProductionAnalytics />
      </div>

      {/* ── Quick Links ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            icon: ClipboardList,
            title: lang === "th" ? "คำสั่งซื้อใหม่" : "New Order",
            desc: lang === "th" ? "สร้างคำสั่งซื้อจากลูกค้า" : "Create customer order",
            href: "/request/create",
          },
          {
            icon: Package,
            title: lang === "th" ? "คลังกระจก" : "Inventory",
            desc: lang === "th" ? "จัดการสต็อกและวัสดุ" : "Manage stock & materials",
            href: "/inventory",
          },
          {
            icon: Activity,
            title: lang === "th" ? "ติดตามการผลิต" : "Production",
            desc: lang === "th" ? "สถานะสายการผลิต" : "Production line status",
            href: "/production",
          },
        ].map((link) => (
          <Link key={link.href} href={link.href}>
            <div className="group flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 hover:border-blue-200 dark:hover:border-blue-800/40 transition-colors">
              <div className="h-10 w-10 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                <link.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {link.title}
                </p>
                <p className="text-xs text-slate-400 truncate">{link.desc}</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-400 transition-colors shrink-0" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
