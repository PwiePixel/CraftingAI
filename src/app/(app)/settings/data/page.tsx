import type { Metadata } from "next";
import { DataSection } from "@/components/settings/data-section";
import { requireUser } from "@/lib/server/auth";
import { activePaidPlan } from "@/lib/server/plans";
import { getSettings } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Your data" };

export default async function DataPage() {
  const { user } = await requireUser();
  const subscribed = user.plan_source === "stripe" && activePaidPlan(user, getSettings()) !== null;
  return <DataSection hasSubscription={subscribed} />;
}
