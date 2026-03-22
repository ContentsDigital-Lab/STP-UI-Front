"use client";

import React, { useState } from "react";
import {
  TrendingUp,
  AlertTriangle,
  Boxes,
  History,
  CheckCircle2,
  Clock,
  TrendingDown,
  Activity,
  Package,
  ArrowRight,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { useLanguage } from "@/lib/i18n/language-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis
} from 'recharts';
import { useWebSocket } from "@/lib/hooks/use-socket";

export default function DashboardPage() {
  const { t } = useLanguage();
  const [isActivityOpen, setIsActivityOpen] = useState(true);

  // WebSocket for real-time updates (v8 Socket.io + Rooms)
  const dashboardEvents = [
    'order:updated',
    'inventory:updated',
    'log:updated',
    'request:updated',
    'withdrawal:updated',
    'claim:updated'
  ];

  useWebSocket('dashboard', dashboardEvents, (event: string) => {
    console.log(`[Dashboard] Received ${event}, update signal received`);
    // Ideally, specific fragments of the dashboard would refresh here.
  });

  const kpis = [
    {
      title: t.dashboard.total_stock,
      value: "14,250",
      change: "+12.5%",
      isPositive: true,
      icon: Boxes,
      color: "blue",
      description: "Across all 4 warehouses"
    },
    {
      title: t.dashboard.low_stock_alerts,
      value: "12",
      change: "-2",
      isPositive: true,
      icon: AlertTriangle,
      color: "amber",
      description: "Needs immediate attention"
    },
    {
      title: t.dashboard.pending_requests,
      value: "28",
      change: "+5",
      isPositive: false,
      icon: Clock,
      color: "indigo",
      description: "Awaiting supervisor approval"
    },
    {
      title: t.dashboard.completed_today,
      value: "145",
      change: "+18%",
      isPositive: true,
      icon: CheckCircle2,
      color: "emerald",
      description: "Orders processed in 24h"
    }
  ];

  const recentActivity = [
    { id: 1, type: 'import', material: 'Clear Glass 5mm', qty: '+50', time: '10 mins ago', user: 'Somchai P.' },
    { id: 2, type: 'withdrawal', material: 'Tempered 10mm', qty: '-12', time: '25 mins ago', user: 'Wichai R.' },
    { id: 3, type: 'alert', material: 'Laminated 8mm', qty: 'Low Stock', time: '1 hour ago', user: 'System' },
    { id: 4, type: 'import', material: 'Mirror 3mm', qty: '+100', time: '2 hours ago', user: 'Anan S.' },
  ];

  const chartData = [
    { name: 'Mon', stock: 4000, out: 2400 },
    { name: 'Tue', stock: 3000, out: 1398 },
    { name: 'Wed', stock: 2000, out: 9800 },
    { name: 'Thu', stock: 2780, out: 3908 },
    { name: 'Fri', stock: 1890, out: 4800 },
    { name: 'Sat', stock: 2390, out: 3800 },
    { name: 'Sun', stock: 3490, out: 4300 },
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-6 lg:gap-8 max-w-[1600px] mx-auto w-full overflow-x-hidden">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t.dashboard.welcome}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
            System Operational • All stations reporting healthy
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <Badge variant="outline" className="px-3 py-1 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 font-medium rounded-lg shadow-sm text-xs sm:text-sm">
            Last updated: Just now
          </Badge>
          <Button className="bg-primary hover:bg-primary/90 shadow-primary/20 dark:bg-[#E8601C] dark:hover:bg-[#E8601C]/90 dark:shadow-orange-500/20 text-white font-bold rounded-xl shadow-lg px-4 sm:px-6 text-sm transition-colors">
            Export Report
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {kpis.map((kpi, i) => (
          <Card key={i} className="border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all rounded-3xl overflow-hidden group">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 rounded-2xl bg-blue-50 text-primary dark:bg-[#E8601C]/10 dark:text-[#E8601C] group-hover:scale-110 transition-transform">
                  <kpi.icon className="h-6 w-6" />
                </div>
                <Badge className="bg-blue-50 text-primary dark:bg-[#E8601C]/10 dark:text-[#E8601C] border-none font-bold rounded-lg group-hover:px-3 transition-all">
                  {kpi.change}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{kpi.title}</p>
                <h3 className="text-3xl font-bold text-slate-900 dark:text-white mt-1 tracking-tight">{kpi.value}</h3>
                <p className="text-[11px] text-slate-400 mt-2 font-medium">{kpi.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Floating Toggle Button */}
      <button
        onClick={() => setIsActivityOpen(!isActivityOpen)}
        className="fixed top-1/2 right-0 -translate-y-1/2 z-50 flex items-center justify-center w-8 h-16 bg-white dark:bg-slate-800 border border-r-0 border-slate-200 dark:border-slate-700 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.1)] rounded-l-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all group"
      >
        {isActivityOpen ? (
          <ChevronRight className="text-slate-400 group-hover:text-primary dark:group-hover:text-[#E8601C]" size={20} />
        ) : (
          <ChevronLeft className="text-slate-400 group-hover:text-primary dark:group-hover:text-[#E8601C]" size={20} />
        )}
      </button>

      <div className={`grid grid-cols-1 ${isActivityOpen ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-4 sm:gap-6 lg:gap-8`}>
        {/* Main Chart Section */}
        <Card className={`${isActivityOpen ? 'lg:col-span-2' : 'lg:col-span-1'} border border-slate-200 dark:border-slate-800 shadow-sm rounded-3xl overflow-hidden bg-white dark:bg-slate-900 transition-all duration-300`}>
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 dark:border-slate-800 pb-6">
            <div>
              <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">{t.dashboard.inventory_flow}</CardTitle>
              <CardDescription className="font-medium">Daily balance vs outgoing materials</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="font-bold text-xs rounded-lg">7D</Button>
              <Button variant="outline" size="sm" className="font-bold text-xs rounded-lg border-primary text-primary dark:border-[#E8601C] dark:text-[#E8601C]">30D</Button>
            </div>
          </CardHeader>
          <CardContent className="pt-8">
            <div className="h-[250px] sm:h-[300px] lg:h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorStock" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1B4B9A" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#1B4B9A" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E8601C" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#E8601C" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.5} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fontWeight: 600, fill: '#64748B' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fontWeight: 600, fill: '#64748B' }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="stock" stroke="#1B4B9A" strokeWidth={3} fillOpacity={1} fill="url(#colorStock)" />
                  <Area type="monotone" dataKey="out" stroke="#E8601C" strokeWidth={3} fillOpacity={1} fill="url(#colorOut)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity Section */}
        {isActivityOpen && (
          <Card className="border border-slate-200 dark:border-slate-800 shadow-sm rounded-3xl overflow-hidden bg-white dark:bg-slate-900 animate-in fade-in slide-in-from-right-8 duration-300">
            <CardHeader className="border-b border-slate-50 dark:border-slate-800">
              <CardTitle className="text-xl font-bold text-slate-900 dark:text-white">{t.dashboard.recent_activity}</CardTitle>
              <CardDescription className="font-medium">Latest stock movements</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="space-y-6">
                {recentActivity.map((activity, i) => (
                  <div key={i} className="flex gap-4 group">
                    <div className={`h-11 w-11 rounded-2xl shrink-0 flex items-center justify-center ${activity.type === 'import' ? 'bg-emerald-50 text-emerald-600' :
                        activity.type === 'withdrawal' ? 'bg-orange-50 text-orange-600' :
                          'bg-red-50 text-red-600 animate-pulse'
                      }`}>
                      {activity.type === 'import' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-primary dark:group-hover:text-[#E8601C] transition-colors">
                          {activity.material}
                        </p>
                        <span className={`text-xs font-bold ${activity.type === 'import' ? 'text-emerald-500' :
                            activity.type === 'withdrawal' ? 'text-orange-500' : 'text-red-500'
                          }`}>
                          {activity.qty}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-slate-400 font-medium">{activity.user}</p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase">{activity.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="ghost" className="w-full text-slate-500 font-bold hover:text-primary dark:hover:text-[#E8601C] gap-2 py-6 rounded-2xl group transition-all">
                  View Full Logs
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Navigation / Tools */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        {[
          { icon: Package, title: "Stock Manager", desc: "Add or adjust items", link: "/inventory" },
          { icon: History, title: "Activity Logs", desc: "Detailed audit trail", link: "/inventory" },
          { icon: Activity, title: "System Health", desc: "Production line status", link: "/" },
        ].map((tool, i) => (
          <Link href={tool.link} key={i}>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-3xl border border-slate-200 dark:border-slate-800 hover:border-primary dark:hover:border-[#E8601C] transition-all group cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-white dark:bg-slate-900 flex items-center justify-center text-slate-400 group-hover:bg-primary dark:group-hover:bg-[#E8601C] group-hover:text-white shadow-sm transition-all">
                  <tool.icon className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white group-hover:text-primary dark:group-hover:text-[#E8601C] transition-colors">{tool.title}</h4>
                  <p className="text-sm text-slate-400 font-medium">{tool.desc}</p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
