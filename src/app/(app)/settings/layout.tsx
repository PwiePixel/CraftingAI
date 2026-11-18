import type { Metadata } from "next";
import { SettingsFrame } from "@/components/settings/settings-frame";
import { requireUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <SettingsFrame>{children}</SettingsFrame>;
}
