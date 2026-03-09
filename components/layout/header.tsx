"use client";

import * as React from "react";
import { Menu, Moon, Sun, Globe } from "lucide-react";
import { useTheme } from "next-themes";
import { useLanguage } from "@/lib/i18n/language-context";
import { Button } from "@/components/ui/button";
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
    const { theme, setTheme } = useTheme(); // Added theme to destructuring
    const { lang, setLang, t } = useLanguage();

    // Avoid hydration mismatch
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => {
        setMounted(true);
    }, []);

    const toggleTheme = () => {
        setTheme(theme === "dark" ? "light" : "dark");
    };

    return (
        <header className="sticky top-0 z-10 flex h-16 flex-shrink-0 items-center gap-x-4 border-b bg-background px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
            <Button variant="ghost" size="icon" className="-m-2.5 p-2.5 text-foreground lg:hidden" onClick={onMenuClick}>
                <span className="sr-only">Open sidebar</span>
                <Menu className="h-6 w-6" aria-hidden="true" />
            </Button>

            <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
                <div className="flex flex-1 items-center">
                    <h1 className="text-xl font-semibold font-sans text-foreground">{title || t.dashboard}</h1>
                </div>
                <div className="flex items-center gap-x-4 lg:gap-x-6">
                    <Button
                        variant="ghost"
                        onClick={() => setLang(lang === "th" ? "en" : "th")}
                        className="rounded-full bg-muted/50 hover:bg-muted font-bold px-3 flex items-center gap-1.5"
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

                    {/* Separator */}
                    <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-border" aria-hidden="true" />

                    {/* Profile dropdown */}
                    <DropdownMenu>
                        <DropdownMenuTrigger className="focus:outline-none flex items-center p-1.5 -m-1.5 rounded-md hover:bg-accent/50 transition-colors">
                            <span className="sr-only">Open user menu</span>
                            <Avatar className="h-8 w-8">
                                <AvatarImage src="" alt="@shadcn" />
                                <AvatarFallback className="bg-primary/20 text-primary">SP</AvatarFallback>
                            </Avatar>
                            <span className="hidden lg:flex lg:items-center">
                                <span className="ml-4 text-sm font-semibold leading-6 text-foreground" aria-hidden="true">
                                    Admin User
                                </span>
                            </span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>{t.settings}</DropdownMenuItem>
                                <DropdownMenuItem>Sign out</DropdownMenuItem>
                            </DropdownMenuGroup>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
}
