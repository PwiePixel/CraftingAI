import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getAuth } from "@/lib/server/auth";
import { getSettings } from "@/lib/server/settings";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getAuth()) redirect("/chat");
  const settings = getSettings();
  return (
    <AuthForm
      mode="login"
      siteName={settings.siteName}
      registrationOpen={settings.registrationOpen}
      minimumAge={settings.legal.minimumAge}
    />
  );
}
