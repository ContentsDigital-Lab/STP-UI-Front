"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MapPin, User, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stationsApi } from "@/lib/api/stations";
import { Station } from "@/lib/api/types";
import { useCheckinSocket } from "@/lib/hooks/use-checkin-socket";

type CheckinState = "idle" | "loading" | "success" | "error";

export default function MobileCheckinPage() {
    const params = useParams();
    const router = useRouter();
    const stationId = params.stationId as string;

    const [station, setStation] = useState<Station | null>(null);
    const [loadingStation, setLoadingStation] = useState(true);
    const [workerName, setWorkerName] = useState("");
    const [checkinState, setCheckinState] = useState<CheckinState>("idle");
    const [checkinTime, setCheckinTime] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    const { connected, emitMobileScan } = useCheckinSocket(station?.name ?? null);

    useEffect(() => {
        stationsApi.getById(stationId)
            .then((res) => {
                if (res.success && res.data) setStation(res.data as unknown as Station);
            })
            .catch(() => {})
            .finally(() => setLoadingStation(false));
    }, [stationId]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem("auth_user");
            if (stored) {
                const user = JSON.parse(stored);
                const name = user.name || user.username || user.displayName || "";
                if (name) setWorkerName(name);
            }
        } catch {}
    }, []);

    function handleCheckin() {
        const name = workerName.trim();
        if (!name) {
            setErrorMsg("กรุณาใส่ชื่อ");
            return;
        }
        if (!connected) {
            setErrorMsg("ไม่สามารถเชื่อมต่อ Socket ได้ — กรุณารอสักครู่");
            return;
        }

        setCheckinState("loading");
        setErrorMsg("");

        emitMobileScan(name);

        const time = new Date().toLocaleTimeString("th-TH");
        setCheckinTime(time);
        setCheckinState("success");
    }

    if (loadingStation) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (checkinState === "success") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-6">
                <div className="w-full max-w-sm text-center space-y-6">
                    <div className="mx-auto w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                    </div>

                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold text-foreground">เช็คอินสำเร็จ!</h1>
                        <p className="text-sm text-muted-foreground">ลงเวลาเข้าสถานีเรียบร้อย</p>
                    </div>

                    <div className="rounded-xl border bg-card p-5 space-y-3 text-left">
                        <div className="flex items-center gap-3">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">พนักงาน</p>
                                <p className="text-sm font-bold text-foreground">{workerName}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">สถานี</p>
                                <p className="text-sm font-bold text-foreground">{station?.name ?? stationId}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">เวลา</p>
                                <p className="text-sm font-bold text-foreground">{checkinTime}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <Button
                            onClick={() => { setCheckinState("idle"); setCheckinTime(""); }}
                            variant="outline"
                            className="w-full"
                        >
                            เช็คอินอีกครั้ง
                        </Button>
                        <Button
                            onClick={() => router.push(`/stations/${stationId}`)}
                            variant="ghost"
                            size="sm"
                            className="gap-1.5 text-muted-foreground"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            กลับหน้าสถานี
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center space-y-1">
                    <h1 className="text-2xl font-bold text-foreground">เช็คอินเข้าสถานี</h1>
                    <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{station?.name ?? "กำลังโหลด..."}</span>
                    </div>
                </div>

                <div className="rounded-xl border bg-card p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            ชื่อพนักงาน
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                            <input
                                type="text"
                                value={workerName}
                                onChange={(e) => { setWorkerName(e.target.value); setErrorMsg(""); }}
                                placeholder="ใส่ชื่อของคุณ..."
                                className="w-full rounded-lg border bg-background pl-9 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                                autoFocus
                            />
                        </div>
                    </div>

                    {errorMsg && (
                        <p className="text-xs text-red-500 font-medium">{errorMsg}</p>
                    )}

                    <Button
                        onClick={handleCheckin}
                        disabled={checkinState === "loading" || !workerName.trim()}
                        className="w-full py-3 text-sm font-bold gap-2"
                        size="lg"
                    >
                        {checkinState === "loading" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <CheckCircle2 className="h-4 w-4" />
                        )}
                        เช็คอิน
                    </Button>

                    <p className="text-center text-[10px] text-muted-foreground">
                        {connected
                            ? "🟢 เชื่อมต่อแล้ว"
                            : "🔴 กำลังเชื่อมต่อ..."}
                    </p>
                </div>

                <Button
                    onClick={() => router.push(`/stations/${stationId}`)}
                    variant="ghost"
                    size="sm"
                    className="w-full gap-1.5 text-muted-foreground"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    กลับหน้าสถานี
                </Button>
            </div>
        </div>
    );
}
