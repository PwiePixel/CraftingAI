import type { Metadata } from "next";
import { ProfileSection } from "@/components/settings/profile-section";
import { requireUser } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const { user } = await requireUser();
  return <ProfileSection memberSince={user.created_at} />;
}
