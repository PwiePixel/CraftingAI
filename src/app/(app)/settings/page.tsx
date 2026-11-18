import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { requireUser } from "@/lib/server/auth";
import { countUserSessions } from "@/lib/server/sessions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user } = await requireUser();
  return <SettingsView memberSince={user.created_at} sessionCount={countUserSessions(user.id)} />;
}
