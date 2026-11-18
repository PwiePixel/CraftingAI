"use client";

import { useState, type FormEvent } from "react";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";

export function SecuritySection({ sessionCount }: { sessionCount: number }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [otherSessions, setOtherSessions] = useState(Math.max(0, sessionCount - 1));

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setSaving(true);
    try {
      await api("/api/me/password", { body: { currentPassword, newPassword } });
      setCurrentPassword("");
      setNewPassword("");
      setOtherSessions(0);
      toast.success("Password changed. Other devices have been signed out.");
    } catch (error) {
      setPasswordError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function signOutOthers() {
    try {
      await api("/api/me/sessions", { method: "DELETE" });
      setOtherSessions(0);
      toast.success("Signed out of all other devices.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <Card>
        <CardHeader title="Password" description="Changing your password signs you out on all other devices." />
        <form onSubmit={changePassword} className="flex flex-col gap-4 p-5">
          {passwordError ? <Alert>{passwordError}</Alert> : null}
          <Field label="Current password" htmlFor="current-password">
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </Field>
          <Field label="New password" htmlFor="new-password" hint="At least 10 characters.">
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </Field>
          <div>
            <Button type="submit" loading={saving} disabled={!currentPassword || newPassword.length < 10}>
              Change password
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Devices"
          description={
            otherSessions > 0
              ? `You are signed in on ${otherSessions} other ${otherSessions === 1 ? "device" : "devices"}.`
              : "You are only signed in on this device."
          }
          action={
            <Button variant="secondary" size="sm" onClick={signOutOthers} disabled={otherSessions === 0}>
              Sign out other devices
            </Button>
          }
        />
      </Card>
    </>
  );
}
