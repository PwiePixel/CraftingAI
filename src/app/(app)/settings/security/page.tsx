import type { Metadata } from "next";
import { SecuritySection } from "@/components/settings/security-section";
import { requireUser } from "@/lib/server/auth";
import { countUserSessions } from "@/lib/server/sessions";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  const { user } = await requireUser();
  return <SecuritySection sessionCount={countUserSessions(user.id)} />;
}
