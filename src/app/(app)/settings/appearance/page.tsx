import type { Metadata } from "next";
import { ThemeToggle } from "@/components/app/user-menu";
import { Card, CardHeader } from "@/components/ui";
import { requireUser } from "@/lib/server/auth";
import { getThemePreference } from "@/lib/server/theme";

export const metadata: Metadata = { title: "Appearance" };

export default async function AppearancePage() {
  await requireUser();
  return (
    <Card>
      <CardHeader title="Appearance" description="Choose how the interface looks on this device." />
      <div className="max-w-xs p-5">
        <ThemeToggle initial={await getThemePreference()} />
      </div>
    </Card>
  );
}
