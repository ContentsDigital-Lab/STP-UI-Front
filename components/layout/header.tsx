"use client";

import * as React from "react";
import { Menu, Moon, Sun, Globe } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/language-context";
import { useAuth } from "@/lib/auth/auth-context";
import { authApi } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/layout/notification-bell";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface HeaderProps {
    onMenuClick: () => void;
    title?: string;
}

export function Header({ onMenuClick, title }: HeaderProps) {
    const { theme, setTheme } = useTheme();
    const { lang, setLang, t } = useLanguage();
    const { user, logout } = useAuth();
    const router = useRouter();

    // Avoid hydration mismatch
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => {
        setMounted(true);
    }, []);

    const toggleTheme = () => {
        setTheme(theme === "dark" ? "light" : "dark");
    };

    const handleLogout = async () => {
        try {
            await authApi.logout();
        } catch (error) {
            console.error("Logout API failed", error);
        } finally {
            logout(); // always clear local session
            router.push("/login"); // redirect to login page
        }
    };

    return (
        <header className="sticky top-0 z-10 flex shrink-0 h-14 sm:h-16 xl:h-20 items-center gap-x-2 sm:gap-x-4 border-b bg-background px-3 shadow-sm sm:px-4 md:px-6 lg:px-8">
            <Button variant="ghost" size="icon" className="-m-1.5 p-2 text-foreground lg:hidden" onClick={onMenuClick}>
                <span className="sr-only">Open sidebar</span>
                <Menu className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
            </Button>

            <div className="flex flex-1 gap-x-2 sm:gap-x-4 self-stretch lg:gap-x-6">
                <div className="flex flex-1 items-center min-w-0">
                    <h1 className="text-base sm:text-xl font-semibold font-sans text-foreground truncate">{title || t.dashboard.label}</h1>
                </div>
                <div className="flex items-center gap-x-2 sm:gap-x-4 lg:gap-x-6">
                    <Button
                        variant="ghost"
                        onClick={() => setLang(lang === "th" ? "en" : "th")}
                        className="rounded-full bg-muted/50 hover:bg-muted font-bold px-2 sm:px-3 flex items-center gap-1 sm:gap-1.5"
                        title={t.language}
                    >
                        <Globe className="h-4 w-4 text-primary" />
                        <span className="text-foreground">{mounted ? (lang === "th" ? "TH" : "EN") : "TH"}</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleTheme}
                        className="rounded-full bg-muted/50 hover:bg-muted"
                    >
                        {mounted ? (
                            theme === "dark" ? (
                                <Moon className="h-5 w-5 text-blue-400" />
                            ) : (
                                <Sun className="h-5 w-5 text-orange-500" />
                            )
                        ) : (
                            <div className="h-5 w-5" />
                        )}
                        <span className="sr-only">Toggle theme</span>
                    </Button>

                    <NotificationBell />

                    {/* Separator */}
                    <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-border" aria-hidden="true" />

                    {/* Profile dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger className="focus:outline-none flex items-center p-1.5 -m-1.5 rounded-md hover:bg-accent/50 transition-colors">
                            <span className="sr-only">Open user menu</span>
                            <Avatar className="h-8 w-8">
                                <AvatarImage src="" alt="@shadcn" />
                                <AvatarFallback className="bg-primary/20 text-primary">
                                    {user?.name?.substring(0, 2).toUpperCase() || "SP"}
                                </AvatarFallback>
                            </Avatar>
                            <span className="hidden lg:flex lg:items-center">
                                <span className="ml-4 text-sm font-semibold leading-6 text-foreground" aria-hidden="true">
                                    {user ? user.name : "Admin User"}
                                </span>
                            </span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                                <DropdownMenuLabel>
                                    <div className="flex flex-col space-y-1">
                                        <p className="text-sm font-medium leading-none">{user?.name}</p>
                                        <p className="text-xs leading-none text-muted-foreground">{user?.username}</p>
                                        <div className="mt-1 pt-1 opacity-70">Role: <span className="capitalize">{user?.role}</span></div>
                                    </div>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => router.push("/settings")}>{t.settings}</DropdownMenuItem>
                                <DropdownMenuItem onClick={handleLogout} className="text-red-500 cursor-pointer focus:text-red-500 focus:bg-red-50 dark:focus:bg-red-950">
                                    Sign out
                                </DropdownMenuItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
}
