import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { LanguageProvider } from "@/lib/i18n/language-context";
import { AuthProvider } from "@/lib/auth/auth-context";
import { AppLayout } from "@/components/layout/app-layout";
import { Toaster } from "sonner";

const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Standard Plus",
  description: "Standard Plus Glass Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body
        className={`${prompt.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <LanguageProvider>
              <AppLayout>{children}</AppLayout>
              <Toaster position="top-center" richColors closeButton />
            </LanguageProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html >
  );
}
