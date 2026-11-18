import { cookies } from "next/headers";
import { AppShell, type ShellData } from "@/components/app/shell";
import { requireUser } from "@/lib/server/auth";
import { listConversations } from "@/lib/server/conversations";
import { getSettings, publicSite } from "@/lib/server/settings";
import { getThemePreference } from "@/lib/server/theme";
import { publicTiers } from "@/lib/server/usage";
import { toSessionUser } from "@/lib/server/users";
import { isTierId } from "@/lib/shared/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  const settings = getSettings();
  const jar = await cookies();
  const preferredTier = jar.get("lishia_tier")?.value;

  const data: ShellData = {
    user: toSessionUser(user),
    site: publicSite(settings),
    tiers: publicTiers(user, settings),
    conversations: listConversations(user.id),
    preferredTier: isTierId(preferredTier) ? preferredTier : null,
    sidebarCollapsed: jar.get("lishia_sidebar")?.value === "collapsed",
    theme: await getThemePreference(),
  };

  return <AppShell data={data}>{children}</AppShell>;
}
