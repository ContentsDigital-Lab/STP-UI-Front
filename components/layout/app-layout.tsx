"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { Loader2 } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
    const [collapsed, setCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { isAuthenticated, isLoading } = useAuth();

    // Close mobile menu when route changes and set mounted state
    useEffect(() => {
        setMobileMenuOpen(false);
        setMounted(true);
    }, [pathname]);

    // Handle Route Protection
    useEffect(() => {
        if (!isLoading) {
            if (!isAuthenticated && pathname !== "/login") {
                router.push("/login");
            } else if (isAuthenticated && pathname === "/login") {
                router.push("/");
            }
        }
    }, [isAuthenticated, isLoading, pathname, router]);

    if (!mounted || isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const isLoginPage = pathname === "/login";

    if (isLoginPage) {
        return <div className="min-h-screen bg-background">{children}</div>;
    }

    return (
        <div
            className="flex h-screen overflow-hidden bg-background"
            style={{ visibility: mounted ? "visible" : "hidden" }}
        >
            {/* Desktop sidebar */}
            <div className="no-print hidden lg:flex lg:flex-shrink-0">
                <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
            </div>

            {/* Mobile sidebar using Sheet */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetContent side="left" className="p-0 !w-[240px] max-w-[85vw]" showCloseButton={false}>
                    <Sidebar collapsed={false} setCollapsed={() => { }} onNavigate={() => setMobileMenuOpen(false)} />
                </SheetContent>
            </Sheet>

            {/* Main content */}
            <div className="flex flex-1 flex-col overflow-hidden">
                <Header onMenuClick={() => setMobileMenuOpen(true)} />
                {pathname.startsWith("/request/create") ? (
                    <main className="flex-1 overflow-y-auto lg:overflow-hidden bg-muted/30">
                        {children}
                    </main>
                ) : /^\/stations\/designer\/.+/.test(pathname) ? (
                    /* Template editor — needs full height, no padding/max-width/scroll */
                    <main className="flex-1 overflow-hidden">
                        {children}
                    </main>
                ) : (
                    <main className="flex-1 overflow-y-auto bg-muted/30 p-0 sm:p-0 md:p-6 print:p-0">
                        <div className="w-full">
                            {children}
                        </div>
                    </main>
                )}
            </div>
        </div>
    );
}
