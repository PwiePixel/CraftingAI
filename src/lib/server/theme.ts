import "server-only";
import { cookies } from "next/headers";
import type { ThemePreference } from "@/lib/shared/types";

export async function getThemePreference(): Promise<ThemePreference> {
  const value = (await cookies()).get("theme")?.value;
  return value === "light" || value === "dark" ? value : "system";
}
