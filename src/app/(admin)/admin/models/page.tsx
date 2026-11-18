import type { Metadata } from "next";
import { ModelsForm } from "@/components/admin/models-form";
import { PageHeader } from "@/components/admin/page-header";
import { requireAdmin } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Models & limits" };

export default async function AdminModelsPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Models & limits"
        description="Choose which model powers each tier, what it is called, and how much each user may use it."
      />
      <ModelsForm settings={getSettings()} />
    </>
  );
}
