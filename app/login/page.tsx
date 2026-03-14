"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { authApi } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Loader2, ShieldAlert } from "lucide-react";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [sessionExpired, setSessionExpired] = useState(false);

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
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="space-y-2 text-center pb-6">
                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#1B4B9A] to-[#E8601C] flex items-center justify-center font-bold text-white text-2xl shadow-sm">
                            S+
                        </div>
                    </div>
                    <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
                    <CardDescription>
                        Enter your credentials to access your account
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {sessionExpired && (
                        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                            <ShieldAlert className="h-4 w-4 shrink-0" />
                            <span>Your session has expired. Please sign in again.</span>
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                type="text"
                                placeholder="Enter your username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Password</Label>
                            </div>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        {error && (
                            <div className="text-sm font-medium text-destructive dark:text-red-400">
                                {error}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full bg-[#1B4B9A] hover:bg-[#1B4B9A]/90 text-white"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                "Sign In"
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
