"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, CardHeader, Field, Input, Switch, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import type { Settings } from "@/lib/shared/settings-schema";

export function SettingsForm({ settings }: { settings: Settings }) {
  const router = useRouter();
  const toast = useToast();
  const [siteName, setSiteName] = useState(settings.siteName);
  const [assistantName, setAssistantName] = useState(settings.assistantName);
  const [tagline, setTagline] = useState(settings.tagline);
  const [announcement, setAnnouncement] = useState(settings.announcement);
  const [registrationOpen, setRegistrationOpen] = useState(settings.registrationOpen);
  const [inDevelopment, setInDevelopment] = useState(settings.inDevelopment);
  const [maxDailyRegistrations, setMaxDailyRegistrations] = useState(
    String(settings.maxDailyRegistrations),
  );
  const [customInstructions, setCustomInstructions] = useState(settings.customInstructions);
  const [legal, setLegal] = useState({
    ...settings.legal,
    minimumAge: String(settings.legal.minimumAge),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api("/api/admin/settings", {
        method: "PUT",
        body: {
          siteName,
          assistantName,
          tagline,
          announcement,
          inDevelopment,
          registrationOpen,
          maxDailyRegistrations: Number(maxDailyRegistrations),
          customInstructions,
          legal: { ...legal, minimumAge: Number(legal.minimumAge) },
        },
      });
      toast.success("Settings saved.");
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
        <CardHeader title="Branding" description="How the site and the assistant present themselves." />
        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Site name" htmlFor="site-name">
              <Input id="site-name" required maxLength={40} value={siteName} onChange={(event) => setSiteName(event.target.value)} />
            </Field>
            <Field label="Assistant name" htmlFor="assistant-name" hint="The name the AI uses for itself.">
              <Input
                id="assistant-name"
                required
                maxLength={40}
                value={assistantName}
                onChange={(event) => setAssistantName(event.target.value)}
              />
            </Field>
          </div>
          <Field label="Tagline" htmlFor="tagline">
            <Input id="tagline" maxLength={120} value={tagline} onChange={(event) => setTagline(event.target.value)} />
          </Field>
          <Field
            label="Announcement"
            htmlFor="announcement"
            hint="Shown as a banner above every chat. Leave empty to hide it."
          >
            <Input
              id="announcement"
              maxLength={300}
              value={announcement}
              onChange={(event) => setAnnouncement(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Access and status" />
        <div className="flex flex-col gap-5 p-5">
          <Switch
            checked={registrationOpen}
            onChange={setRegistrationOpen}
            label="Open registration"
            description="When off, only administrators can create accounts (Users → Add user)."
          />
          <Field
            label="New accounts per day"
            htmlFor="max-registrations"
            hint="Site-wide ceiling on registrations per day (UTC). It limits how far the free allowance can be multiplied with throwaway accounts. 0 removes the ceiling."
            className="max-w-xs"
          >
            <Input
              id="max-registrations"
              type="number"
              min={0}
              step={1}
              required
              value={maxDailyRegistrations}
              onChange={(event) => setMaxDailyRegistrations(event.target.value)}
            />
          </Field>
          <Switch
            checked={inDevelopment}
            onChange={setInDevelopment}
            label="Show the “in development” notice"
            description="Tells visitors on the home page that the project is still being built. Turn it off once you consider the site finished."
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Assistant behaviour"
          description="Optional instructions added to the assistant's built-in guidelines for every conversation."
        />
        <div className="p-5">
          <Field
            label="Custom instructions"
            htmlFor="custom-instructions"
            hint="For example a preferred tone, topics to focus on, or things to avoid. Keep it short: it is sent with every message."
          >
            <Textarea
              id="custom-instructions"
              rows={6}
              maxLength={4000}
              value={customInstructions}
              onChange={(event) => setCustomInstructions(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Legal information"
          description="Shown in the Terms of Use, Privacy Policy and Legal Notice. Have the generated documents reviewed by a lawyer before you launch."
        />
        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Operator (person or company)" htmlFor="operator-name">
              <Input
                id="operator-name"
                maxLength={120}
                value={legal.operatorName}
                onChange={(event) => setLegal({ ...legal, operatorName: event.target.value })}
              />
            </Field>
            <Field label="Contact email" htmlFor="contact-email">
              <Input
                id="contact-email"
                type="email"
                maxLength={200}
                value={legal.contactEmail}
                onChange={(event) => setLegal({ ...legal, contactEmail: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Postal address" htmlFor="operator-address" hint="Required for the Legal Notice in many countries.">
            <Textarea
              id="operator-address"
              rows={3}
              maxLength={400}
              value={legal.operatorAddress}
              onChange={(event) => setLegal({ ...legal, operatorAddress: event.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Governing law" htmlFor="governing-law" hint="For example “Germany”.">
              <Input
                id="governing-law"
                maxLength={120}
                value={legal.governingLaw}
                onChange={(event) => setLegal({ ...legal, governingLaw: event.target.value })}
              />
            </Field>
            <Field label="Minimum age" htmlFor="minimum-age">
              <Input
                id="minimum-age"
                type="number"
                min={13}
                max={21}
                required
                value={legal.minimumAge}
                onChange={(event) => setLegal({ ...legal, minimumAge: event.target.value })}
              />
            </Field>
            <Field label="Effective date" htmlFor="effective-date">
              <Input
                id="effective-date"
                type="date"
                required
                value={legal.effectiveDate}
                onChange={(event) => setLegal({ ...legal, effectiveDate: event.target.value })}
              />
            </Field>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" loading={saving} className="shadow-pop">
          Save changes
        </Button>
      </div>
    </form>
  );
}
