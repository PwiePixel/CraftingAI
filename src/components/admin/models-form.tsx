"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, CardHeader, Field, Input, Select, Switch } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { EFFORT_LEVELS, type Settings, type TierSettings } from "@/lib/shared/settings-schema";
import { TIER_IDS, type TierId } from "@/lib/shared/types";

/** Numeric fields are edited as text so they can be empty while typing. */
type TierDraft = Omit<
  TierSettings,
  "dailyLimit" | "maxOutputTokens" | "contextChars" | "inputPricePerMTok" | "outputPricePerMTok"
> & {
  dailyLimit: string;
  maxOutputTokens: string;
  contextChars: string;
  inputPricePerMTok: string;
  outputPricePerMTok: string;
};

const tierTitles: Record<TierId, string> = {
  lite: "Basic tier",
  pro: "Medium tier",
  ultra: "Top tier",
};

function toDraft(tier: TierSettings): TierDraft {
  return {
    ...tier,
    dailyLimit: String(tier.dailyLimit),
    maxOutputTokens: String(tier.maxOutputTokens),
    contextChars: String(tier.contextChars),
    inputPricePerMTok: String(tier.inputPricePerMTok),
    outputPricePerMTok: String(tier.outputPricePerMTok),
  };
}

function fromDraft(draft: TierDraft): TierSettings {
  return {
    ...draft,
    dailyLimit: Number(draft.dailyLimit),
    maxOutputTokens: Number(draft.maxOutputTokens),
    contextChars: Number(draft.contextChars),
    inputPricePerMTok: Number(draft.inputPricePerMTok),
    outputPricePerMTok: Number(draft.outputPricePerMTok),
  };
}

export function ModelsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const toast = useToast();
  const [tiers, setTiers] = useState<Record<TierId, TierDraft>>({
    lite: toDraft(settings.tiers.lite),
    pro: toDraft(settings.tiers.pro),
    ultra: toDraft(settings.tiers.ultra),
  });
  const [defaultTier, setDefaultTier] = useState<TierId>(settings.defaultTier);
  const [dailyBudget, setDailyBudget] = useState(String(settings.dailyBudgetUsd));
  const [maxMessageChars, setMaxMessageChars] = useState(String(settings.maxMessageChars));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof TierDraft>(id: TierId, key: K, value: TierDraft[K]) {
    setTiers((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/api/admin/settings", {
        method: "PUT",
        body: {
          defaultTier,
          dailyBudgetUsd: Number(dailyBudget),
          maxMessageChars: Number(maxMessageChars),
          tiers: {
            lite: fromDraft(tiers.lite),
            pro: fromDraft(tiers.pro),
            ultra: fromDraft(tiers.ultra),
          },
        },
      });
      toast.success("Models and limits saved.");
      router.refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {error ? <Alert>{error}</Alert> : null}

      <Card>
        <CardHeader
          title="Cost controls"
          description="Protect your budget: when today's estimated spend reaches the cap, chatting pauses for everyone until midnight UTC."
        />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Daily budget (USD)" htmlFor="daily-budget" hint="0 disables the cap.">
            <Input
              id="daily-budget"
              type="number"
              min={0}
              step="0.01"
              required
              value={dailyBudget}
              onChange={(event) => setDailyBudget(event.target.value)}
            />
          </Field>
          <Field label="Maximum message length" htmlFor="max-chars" hint="Characters per message.">
            <Input
              id="max-chars"
              type="number"
              min={500}
              max={200000}
              step={100}
              required
              value={maxMessageChars}
              onChange={(event) => setMaxMessageChars(event.target.value)}
            />
          </Field>
          <Field label="Default model" htmlFor="default-tier" hint="Selected for new users.">
            <Select
              id="default-tier"
              value={defaultTier}
              onChange={(event) => setDefaultTier(event.target.value as TierId)}
            >
              {TIER_IDS.map((id) => (
                <option key={id} value={id} disabled={!tiers[id].enabled}>
                  {tiers[id].label || id}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {TIER_IDS.map((id) => {
        const tier = tiers[id];
        const field = (name: string) => `${id}-${name}`;
        return (
          <Card key={id}>
            <CardHeader
              title={`${tierTitles[id]}: ${tier.label || "Unnamed"}`}
              description="Users only ever see the display name and description, never the upstream model."
            />
            <div className="flex flex-col gap-5 p-5">
              <Switch
                checked={tier.enabled}
                onChange={(next) => update(id, "enabled", next)}
                label="Available to users"
                description="Disabled models disappear from the model picker."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Display name" htmlFor={field("label")}>
                  <Input
                    id={field("label")}
                    required
                    maxLength={40}
                    value={tier.label}
                    onChange={(event) => update(id, "label", event.target.value)}
                  />
                </Field>
                <Field label="Upstream model ID" htmlFor={field("model")} hint="The provider's model identifier.">
                  <Input
                    id={field("model")}
                    required
                    maxLength={100}
                    spellCheck={false}
                    className="font-mono"
                    value={tier.model}
                    onChange={(event) => update(id, "model", event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Description" htmlFor={field("description")}>
                <Input
                  id={field("description")}
                  maxLength={160}
                  value={tier.description}
                  onChange={(event) => update(id, "description", event.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Messages per user per day" htmlFor={field("limit")}>
                  <Input
                    id={field("limit")}
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={tier.dailyLimit}
                    onChange={(event) => update(id, "dailyLimit", event.target.value)}
                  />
                </Field>
                <Field label="Maximum reply length" htmlFor={field("max-tokens")} hint="Output tokens.">
                  <Input
                    id={field("max-tokens")}
                    type="number"
                    min={256}
                    max={64000}
                    step={1}
                    required
                    value={tier.maxOutputTokens}
                    onChange={(event) => update(id, "maxOutputTokens", event.target.value)}
                  />
                </Field>
                <Field label="Conversation memory" htmlFor={field("context")} hint="Characters of history sent.">
                  <Input
                    id={field("context")}
                    type="number"
                    min={4000}
                    step={1000}
                    required
                    value={tier.contextChars}
                    onChange={(event) => update(id, "contextChars", event.target.value)}
                  />
                </Field>
                <Field label="Reasoning effort" htmlFor={field("effort")} hint="Higher costs more.">
                  <Select
                    id={field("effort")}
                    value={tier.effort}
                    onChange={(event) => update(id, "effort", event.target.value as TierSettings["effort"])}
                  >
                    {EFFORT_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level === "default" ? "Provider default" : level.charAt(0).toUpperCase() + level.slice(1)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Input price (USD per million tokens)"
                  htmlFor={field("input-price")}
                  hint="Used only to estimate spend."
                >
                  <Input
                    id={field("input-price")}
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={tier.inputPricePerMTok}
                    onChange={(event) => update(id, "inputPricePerMTok", event.target.value)}
                  />
                </Field>
                <Field label="Output price (USD per million tokens)" htmlFor={field("output-price")}>
                  <Input
                    id={field("output-price")}
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={tier.outputPricePerMTok}
                    onChange={(event) => update(id, "outputPricePerMTok", event.target.value)}
                  />
                </Field>
              </div>
              <Switch
                checked={tier.refusalFallback}
                onChange={(next) => update(id, "refusalFallback", next)}
                label="Automatic fallback"
                description="If the model declines a harmless request, let the provider retry it on a substitute model. A retry is billed at the substitute's rates. Not every model supports this."
              />
            </div>
          </Card>
        );
      })}

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" loading={saving} className="shadow-pop">
          Save changes
        </Button>
      </div>
    </form>
  );
}
