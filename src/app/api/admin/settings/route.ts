import { apiAdmin } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { ApiError, clientIp, json, readJson, route } from "@/lib/server/http";
import { deepMerge, getSettings, updateSettings } from "@/lib/server/settings";
import { settingsSchema } from "@/lib/shared/settings-schema";
import { z } from "zod";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await apiAdmin();
  return json({ settings: getSettings() });
});

/** Accepts a partial settings object; the merged result is validated as a whole. */
export const PUT = route(async (request) => {
  const { user } = await apiAdmin();
  const patch = await readJson(request, z.record(z.string(), z.unknown()), 64_000);

  const candidate = settingsSchema.parse(deepMerge(getSettings(), patch));
  const enabled = Object.values(candidate.tiers).filter((tier) => tier.enabled);
  if (enabled.length === 0) {
    throw new ApiError(400, "invalid_request", "At least one model has to stay enabled.");
  }
  if (!candidate.tiers[candidate.defaultTier].enabled) {
    throw new ApiError(400, "invalid_request", "The default model has to be enabled.");
  }

  const settings = updateSettings(patch);
  audit({
    action: "settings.update",
    actor: user,
    detail: { sections: Object.keys(patch) },
    ip: clientIp(request),
  });
  return json({ settings });
});
