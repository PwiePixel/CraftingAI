"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, CardHeader, Field, Input, Switch, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { planIdFromName, type BillingSettings, type Plan } from "@/lib/shared/billing-schema";
import { TIER_IDS, type TierId } from "@/lib/shared/types";

/** Numbers are edited as text so a field can be empty while typing. */
interface PlanDraft {
  id: string;
  name: string;
  description: string;
  price: string;
  enabled: boolean;
  highlighted: boolean;
  features: string;
  limits: Record<TierId, { fiveHour: string; weekly: string }>;
}

function toDraft(plan: Plan): PlanDraft {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    price: (plan.priceCents / 100).toFixed(2),
    enabled: plan.enabled,
    highlighted: plan.highlighted,
    features: plan.features.join("\n"),
    limits: {
      lite: { fiveHour: String(plan.limits.lite.fiveHour), weekly: String(plan.limits.lite.weekly) },
      pro: { fiveHour: String(plan.limits.pro.fiveHour), weekly: String(plan.limits.pro.weekly) },
      ultra: { fiveHour: String(plan.limits.ultra.fiveHour), weekly: String(plan.limits.ultra.weekly) },
    },
  };
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function fromDraft(draft: PlanDraft): Plan {
  const limit = (id: TierId) => ({
    fiveHour: Math.round(Number(draft.limits[id].fiveHour)),
    weekly: Math.round(Number(draft.limits[id].weekly)),
  });
  return {
    id: draft.id,
    name: draft.name,
    description: draft.description,
    priceCents: Math.round(Number(draft.price.replace(",", ".")) * 100),
    enabled: draft.enabled,
    highlighted: draft.highlighted,
    features: lines(draft.features),
    limits: { lite: limit("lite"), pro: limit("pro"), ultra: limit("ultra") },
  };
}

export function PlansForm({
  billing,
  tierLabels,
  subscribers,
}: {
  billing: BillingSettings;
  tierLabels: Record<TierId, string>;
  /** Number of users per plan identifier. */
  subscribers: Record<string, number>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [currency, setCurrency] = useState(billing.currency.toUpperCase());
  const [freeName, setFreeName] = useState(billing.freePlan.name);
  const [freeDescription, setFreeDescription] = useState(billing.freePlan.description);
  const [freeFeatures, setFreeFeatures] = useState(billing.freePlan.features.join("\n"));
  const [plans, setPlans] = useState<PlanDraft[]>(billing.plans.map(toDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(index: number, patch: Partial<PlanDraft>) {
    setPlans((current) => current.map((plan, position) => (position === index ? { ...plan, ...patch } : plan)));
  }

  function updateLimit(index: number, tier: TierId, key: "fiveHour" | "weekly", value: string) {
    setPlans((current) =>
      current.map((plan, position) =>
        position === index
          ? { ...plan, limits: { ...plan.limits, [tier]: { ...plan.limits[tier], [key]: value } } }
          : plan,
      ),
    );
  }

  function addPlan() {
    const name = "New plan";
    setPlans((current) => [
      ...current,
      {
        id: planIdFromName(name, current.map((plan) => plan.id)),
        name,
        description: "",
        price: "9.99",
        enabled: false,
        highlighted: false,
        features: "",
        limits: {
          lite: { fiveHour: "100", weekly: "1000" },
          pro: { fiveHour: "30", weekly: "200" },
          ultra: { fiveHour: "0", weekly: "0" },
        },
      },
    ]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/api/admin/settings", {
        method: "PUT",
        body: {
          billing: {
            currency: currency.trim().toLowerCase(),
            freePlan: { name: freeName, description: freeDescription, features: lines(freeFeatures) },
            plans: plans.map(fromDraft),
          },
        },
      });
      toast.success("Plans saved.");
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
          title="Free plan"
          description="Every account starts here. Its limits are the daily limits under Models & limits."
        />
        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Name" htmlFor="free-name">
              <Input id="free-name" required maxLength={40} value={freeName} onChange={(event) => setFreeName(event.target.value)} />
            </Field>
            <Field label="Currency" htmlFor="currency" hint="For all prices.">
              <Input
                id="currency"
                required
                maxLength={3}
                className="uppercase"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="free-description">
            <Input
              id="free-description"
              maxLength={160}
              value={freeDescription}
              onChange={(event) => setFreeDescription(event.target.value)}
            />
          </Field>
          <Field label="Features" htmlFor="free-features" hint="One per line. The message limits are listed automatically.">
            <Textarea id="free-features" rows={3} value={freeFeatures} onChange={(event) => setFreeFeatures(event.target.value)} />
          </Field>
        </div>
      </Card>

      {plans.map((plan, index) => {
        const users = subscribers[plan.id] ?? 0;
        const field = (name: string) => `${plan.id}-${name}`;
        return (
          <Card key={plan.id}>
            <CardHeader
              title={plan.name || "Unnamed plan"}
              description={`${users} ${users === 1 ? "user" : "users"} on this plan · identifier “${plan.id}”`}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  disabled={users > 0}
                  title={users > 0 ? "A plan with users cannot be removed. Disable it instead." : undefined}
                  onClick={() => setPlans((current) => current.filter((_, position) => position !== index))}
                >
                  <Trash2 size={15} />
                  Remove
                </Button>
              }
            />
            <div className="flex flex-col gap-5 p-5">
              <Switch
                checked={plan.enabled}
                onChange={(next) => update(index, { enabled: next })}
                label="Can be bought"
                description="When off, the plan is hidden from new customers. People who already have it keep it."
              />
              <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <Field label="Name" htmlFor={field("name")}>
                  <Input
                    id={field("name")}
                    required
                    maxLength={40}
                    value={plan.name}
                    onChange={(event) => update(index, { name: event.target.value })}
                  />
                </Field>
                <Field label={`Price per month (${currency.toUpperCase()})`} htmlFor={field("price")}>
                  <Input
                    id={field("price")}
                    required
                    inputMode="decimal"
                    value={plan.price}
                    onChange={(event) => update(index, { price: event.target.value })}
                  />
                </Field>
              </div>
              <Field label="Description" htmlFor={field("description")}>
                <Input
                  id={field("description")}
                  maxLength={160}
                  value={plan.description}
                  onChange={(event) => update(index, { description: event.target.value })}
                />
              </Field>

              <div>
                <p className="text-[0.8125rem] font-medium">Message limits per model</p>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                  Messages allowed within any 5 hours and within any 7 days. Set both to 0 to leave a
                  model out of this plan.
                </p>
                <div className="mt-3 grid gap-3">
                  {TIER_IDS.map((tier) => (
                    <div key={tier} className="grid grid-cols-[1fr_7rem_7rem] items-end gap-3">
                      <span className="pb-2.5 text-sm">{tierLabels[tier]}</span>
                      <Field label="Per 5 hours" htmlFor={field(`${tier}-5h`)}>
                        <Input
                          id={field(`${tier}-5h`)}
                          type="number"
                          min={0}
                          step={1}
                          required
                          value={plan.limits[tier].fiveHour}
                          onChange={(event) => updateLimit(index, tier, "fiveHour", event.target.value)}
                        />
                      </Field>
                      <Field label="Per week" htmlFor={field(`${tier}-week`)}>
                        <Input
                          id={field(`${tier}-week`)}
                          type="number"
                          min={0}
                          step={1}
                          required
                          value={plan.limits[tier].weekly}
                          onChange={(event) => updateLimit(index, tier, "weekly", event.target.value)}
                        />
                      </Field>
                    </div>
                  ))}
                </div>
              </div>

              <Field label="Features" htmlFor={field("features")} hint="One per line. The message limits are listed automatically.">
                <Textarea
                  id={field("features")}
                  rows={3}
                  value={plan.features}
                  onChange={(event) => update(index, { features: event.target.value })}
                />
              </Field>
              <Switch
                checked={plan.highlighted}
                onChange={(next) => update(index, { highlighted: next })}
                label="Highlight as “Popular”"
              />
            </div>
          </Card>
        );
      })}

      <div>
        <Button variant="secondary" onClick={addPlan} disabled={plans.length >= 6}>
          <Plus size={16} />
          Add a paid plan
        </Button>
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" loading={saving} className="shadow-pop">
          Save changes
        </Button>
      </div>
    </form>
  );
}
