"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { authApi } from "@/lib/api/auth";
import {
    Loader2,
    ShieldAlert,
    Eye,
    EyeOff,
    ArrowRight,
    User,
    Lock,
    Warehouse,
    BarChart3,
    ShieldCheck,
} from "lucide-react";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [sessionExpired, setSessionExpired] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const router = useRouter();
    const { login } = useAuth();

    useEffect(() => {
        const expired = sessionStorage.getItem("session_expired");
        if (expired) {
            setSessionExpired(true);
            sessionStorage.removeItem("session_expired");
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const response = await authApi.login(username, password);
            if (response.success && response.data) {
                login(response.data.token, response.data.worker);
                router.push("/");
            } else {
                setError(response.message || "Login failed");
            }
        } catch (err: any) {
            setError(err.message || "An error occurred during login");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* ── Left: Brand Panel ─────────────────────────────────── */}
            <div className="hidden lg:flex lg:w-[56%] relative flex-col overflow-hidden">
                {/* Background image */}
                <img
                    src="/169276499_3831340936954512_2651830289255053996_n-e1743578771812.jpg"
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                />

                {/* Layered overlays for depth */}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/40" />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/60 to-transparent" />

                {/* Content */}
                <div className="relative z-10 flex flex-col justify-between h-full p-10">
                    {/* Top: Logo */}
                    <div className="flex items-center gap-3">
                        <img
                            src="/logonotname.png"
                            alt="Standard Plus"
                            className="h-10 w-10"
                        />
                        <div className="leading-tight">
                            <h1 className="text-white text-lg font-bold tracking-tight">
                                Standard<span className="text-orange-400">Plus</span>
                            </h1>
                            <p className="text-white/40 text-[10px] font-medium tracking-[0.2em] uppercase">
                                Glass Manufacturing
                            </p>
                        </div>
                    </div>

                    {/* Bottom: Hero text + features */}
                    <div className="space-y-8">
                        <div>
                            <h2 className="text-[2.75rem] font-bold text-white leading-[1.15] tracking-tight">
                                ระบบจัดการ
                                <br />
                                การผลิตกระจก
                            </h2>
                            <p className="mt-4 text-white/50 text-sm leading-relaxed max-w-md">
                                บริหารจัดการคลังสินค้า ติดตามคำสั่งผลิต และควบคุมกระบวนการผลิตทั้งหมดผ่านระบบเดียว
                            </p>
                        </div>

                        {/* Feature cards */}
                        <div className="flex gap-3">
                            {[
                                { icon: Warehouse, title: "คลังสินค้า", desc: "จัดการสต็อกแบบ Real-time" },
                                { icon: BarChart3, title: "รายงาน", desc: "วิเคราะห์ข้อมูลการผลิต" },
                                { icon: ShieldCheck, title: "ปลอดภัย", desc: "ระบบรักษาความปลอดภัย" },
                            ].map((f) => (
                                <div
                                    key={f.title}
                                    className="flex-1 rounded-xl bg-white/[0.07] backdrop-blur-sm border border-white/[0.08] p-4"
                                >
                                    <f.icon className="h-5 w-5 text-blue-400 mb-3" />
                                    <p className="text-white text-sm font-semibold">{f.title}</p>
                                    <p className="text-white/40 text-xs mt-0.5">{f.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Right: Login Form ────────────────────────────────── */}
            <div className="flex-1 flex flex-col">
                {/* Mobile header */}
                <div className="lg:hidden flex items-center gap-3 px-6 pt-6">
                    <img src="/logonotname.png" alt="Standard Plus" className="h-9 w-9" />
                    <span className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                        Standard<span className="text-orange-500">Plus</span>
                    </span>
                </div>

                <div className="flex-1 flex items-center justify-center px-6 sm:px-8">
                    <div className="w-full max-w-[380px]">
                        {/* Form card */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-8">
                            {/* Desktop logo inside card */}
                            <div className="hidden lg:flex items-center gap-2.5 mb-8">
                                <img src="/logonotname.png" alt="" className="h-8 w-8" />
                                <span className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                                    Standard<span className="text-orange-500">Plus</span>
                                </span>
                            </div>

                            <div className="mb-7">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                                    เข้าสู่ระบบ
                                </h2>
                                <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
                                    กรุณากรอกข้อมูลเพื่อเข้าใช้งานระบบ
                                </p>
                            </div>

                            {sessionExpired && (
                                <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-100 p-3 text-[13px] text-amber-700 dark:bg-amber-950/30 dark:border-amber-900/30 dark:text-amber-400">
                                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง</span>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* Username */}
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="username"
                                        className="block text-[13px] font-medium text-slate-600 dark:text-slate-400"
                                    >
                                        ชื่อผู้ใช้งาน
                                    </label>
                                    <div className="relative">
                                        <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
                                            <User className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <input
                                            id="username"
                                            type="text"
                                            autoComplete="username"
                                            placeholder="username"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            required
                                            className="block w-full h-11 rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-150 focus:bg-white focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/8 dark:bg-slate-800/50 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:border-blue-400 dark:focus:ring-blue-400/10"
                                        />
                                    </div>
                                </div>

                                {/* Password */}
                                <div className="space-y-1.5">
                                    <label
                                        htmlFor="password"
                                        className="block text-[13px] font-medium text-slate-600 dark:text-slate-400"
                                    >
                                        รหัสผ่าน
                                    </label>
                                    <div className="relative">
                                        <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2">
                                            <Lock className="h-4 w-4 text-slate-400" />
                                        </div>
                                        <input
                                            id="password"
                                            type={showPassword ? "text" : "password"}
                                            autoComplete="current-password"
                                            placeholder="••••••••"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            className="block w-full h-11 rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-150 focus:bg-white focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/8 dark:bg-slate-800/50 dark:border-slate-700 dark:text-white dark:placeholder:text-slate-500 dark:focus:bg-slate-800 dark:focus:border-blue-400 dark:focus:ring-blue-400/10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                            tabIndex={-1}
                                        >
                                            {showPassword ? (
                                                <EyeOff className="h-4 w-4" />
                                            ) : (
                                                <Eye className="h-4 w-4" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Error */}
                                {error && (
                                    <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/30 px-3 py-2.5 text-[13px] text-red-600 dark:text-red-400">
                                        <div className="size-1.5 shrink-0 rounded-full bg-red-500" />
                                        {error}
                                    </div>
                                )}

                                {/* Submit */}
                                <div className="pt-1">
                                    <button
                                        type="submit"
                                        disabled={isLoading}
                                        className="group flex w-full items-center justify-center gap-2 h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white transition-all duration-150 hover:bg-blue-700 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-600/50 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 dark:bg-blue-500 dark:hover:bg-blue-600 dark:focus-visible:ring-offset-slate-900"
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                กำลังเข้าสู่ระบบ...
                                            </>
                                        ) : (
                                            <>
                                                เข้าสู่ระบบ
                                                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* Footer below card */}
                        <p className="mt-6 text-center text-[11px] text-slate-400 dark:text-slate-600">
                            &copy; {new Date().getFullYear()} Standard Plus Co., Ltd. All rights reserved.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
