import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { ToastProvider } from "@/components/toast";
import { getSettings } from "@/lib/server/settings";
import { getThemePreference } from "@/lib/server/theme";
import "./globals.css";

// Every page depends on the request (session cookie, per-request CSP nonce).
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const settings = getSettings();
  return {
    title: { default: settings.siteName, template: `%s · ${settings.siteName}` },
    description: settings.tagline,
    applicationName: settings.siteName,
    referrer: "strict-origin-when-cross-origin",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121214" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await getThemePreference();
  return (
    <html
      lang="en"
      data-theme={theme === "system" ? undefined : theme}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
