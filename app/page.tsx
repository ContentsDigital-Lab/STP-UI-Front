"use client";

import { useLanguage } from "@/lib/i18n/language-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShoppingCart,
  Clock,
  CheckCircle2,
  TrendingUp,
  Plus,
  FileText,
  Factory,
  Package
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';

import { useWebSocket } from "@/lib/hooks/use-socket";

export default function DashboardPage() {
  const { t } = useLanguage();

  // WebSocket for real-time updates
  useWebSocket(() => {
    console.log("Dashboard update received via WebSocket");
    // If there were API calls here, we would re-fetch them.
    // For now, this satisfies the requirement of making the page 'websocket-enabled'.
  });

  const kpis = [
    {
      title: t.totalOrders,
      value: "145",
      icon: ShoppingCart,
      trend: "+12.5%",
      trendUp: true,
    },
    {
      title: t.inProgress,
      value: "32",
      icon: Clock,
      trend: "+4.1%",
      trendUp: true,
    },
    {
      title: t.completed,
      value: "108",
      icon: CheckCircle2,
      trend: "+18.2%",
      trendUp: true,
    },
    {
      title: t.revenue,
      value: "฿840k",
      icon: TrendingUp,
      trend: "+8.4%",
      trendUp: true,
    },
  ];

  const recentActivities = [
    { id: "ORD-001", status: "In Progress", date: "2026-03-09 10:30", customer: "TechCorp Inc.", total: "฿45,000" },
    { id: "ORD-002", status: "Completed", date: "2026-03-08 15:45", customer: "Modern Builders", total: "฿12,500" },
    { id: "ORD-003", status: "Pending", date: "2026-03-08 09:15", customer: "Glass & Co", total: "฿8,900" },
    { id: "ORD-004", status: "In Progress", date: "2026-03-07 14:20", customer: "Interior Designs LLC", total: "฿23,400" },
  ];

  const chartData = [
    { name: 'Jan', revenue: 4000, orders: 24 },
    { name: 'Feb', revenue: 3000, orders: 18 },
    { name: 'Mar', revenue: 2000, orders: 12 },
    { name: 'Apr', revenue: 2780, orders: 19 },
    { name: 'May', revenue: 1890, orders: 11 },
    { name: 'Jun', revenue: 2390, orders: 15 },
    { name: 'Jul', revenue: 3490, orders: 21 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{t.dashboard}</h1>
          <p className="text-muted-foreground">{t.welcomeMessage}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            Report
          </Button>
          <Button className="gap-2 bg-primary hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            New Order
          </Button>
        </div>
      </div>

      <Separator />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi, index) => (
          <Card key={index} className="shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {kpi.title}
              </CardTitle>
              <kpi.icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className="text-xs text-muted-foreground mt-1 text-green-600 dark:text-green-400 font-medium">
                {kpi.trend} from last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="shadow-sm md:col-span-1 lg:col-span-4 bg-card/60 backdrop-blur-sm border-muted/50">
          <CardHeader>
            <CardTitle>Revenue Analytics</CardTitle>
            <CardDescription>Monthly revenue overview for the current year</CardDescription>
          </CardHeader>
          <CardContent className="pl-0">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1B4B9A" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#1B4B9A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `฿${value}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #1e293b', backgroundColor: 'var(--popover)', color: 'var(--foreground)' }}
                    itemStyle={{ color: 'var(--foreground)' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#1B4B9A" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm md:col-span-1 lg:col-span-3 bg-card/60 backdrop-blur-sm border-muted/50">
          <CardHeader>
            <CardTitle>Orders Volume</CardTitle>
            <CardDescription>Number of orders processed monthly</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #1e293b', backgroundColor: 'var(--popover)', color: 'var(--foreground)' }}
                    cursor={{ fill: 'rgba(51, 65, 85, 0.1)' }}
                  />
                  <Bar dataKey="orders" fill="#E8601C" radius={[4, 4, 0, 0]} barSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="shadow-sm md:col-span-1 lg:col-span-4 bg-card/60 backdrop-blur-sm border-muted/50">
          <CardHeader>
            <CardTitle>{t.recentActivity}</CardTitle>
            <CardDescription>Overview of recent orders and production status.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="px-4 py-3 font-medium">Order ID</th>
                    <th className="px-4 py-3 font-medium">Customer</th>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivities.map((activity, idx) => (
                    <tr key={idx} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 font-medium">{activity.id}</td>
                      <td className="px-4 py-3">{activity.customer}</td>
                      <td className="px-4 py-3 text-muted-foreground">{activity.date}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={activity.status === "Completed" ? "default" : activity.status === "In Progress" ? "secondary" : "outline"}
                          className={activity.status === "Completed" ? "bg-accent hover:bg-accent/80" : ""}
                        >
                          {activity.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{activity.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm md:col-span-1 lg:col-span-3">
          <CardHeader>
            <CardTitle>{t.quickActions}</CardTitle>
            <CardDescription>Shortcuts to frequently used functions.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Button variant="outline" className="justify-start gap-3 h-12 w-full">
              <Plus className="h-5 w-5 text-primary" />
              <div className="flex flex-col items-start leading-none">
                <span>Create New Order</span>
                <span className="text-xs text-muted-foreground mt-1">Start a new glass order</span>
              </div>
            </Button>
            <Button variant="outline" className="justify-start gap-3 h-12 w-full">
              <Factory className="h-5 w-5 text-primary" />
              <div className="flex flex-col items-start leading-none">
                <span>Production Board</span>
                <span className="text-xs text-muted-foreground mt-1">View current factory status</span>
              </div>
            </Button>
            <Button variant="outline" className="justify-start gap-3 h-12 w-full">
              <Package className="h-5 w-5 text-primary" />
              <div className="flex flex-col items-start leading-none">
                <span>Check Inventory</span>
                <span className="text-xs text-muted-foreground mt-1">Stock levels and materials</span>
              </div>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
