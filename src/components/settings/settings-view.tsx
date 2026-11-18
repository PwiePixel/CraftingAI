"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import { TopBar, useShell } from "@/components/app/shell";
import { ThemeToggle } from "@/components/app/user-menu";
import { ConfirmDialog, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, CardHeader, Field, Input, buttonClass } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { reloadTo } from "@/lib/client/navigate";
import { formatDate } from "@/lib/shared/format";

export function SettingsView({
  memberSince,
  sessionCount,
}: {
  memberSince: number;
  sessionCount: number;
}) {
  const shell = useShell();
  const toast = useToast();
  const router = useRouter();

  const [name, setName] = useState(shell.user.name);
  const [savingName, setSavingName] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [otherSessions, setOtherSessions] = useState(Math.max(0, sessionCount - 1));
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setSavingName(true);
    try {
      await api("/api/me", { method: "PATCH", body: { name } });
      toast.success("Profile updated.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setSavingPassword(true);
    try {
      await api("/api/me/password", { body: { currentPassword, newPassword } });
      setCurrentPassword("");
      setNewPassword("");
      setOtherSessions(0);
      toast.success("Password changed. Other devices have been signed out.");
    } catch (error) {
      setPasswordError(errorMessage(error));
    } finally {
      setSavingPassword(false);
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

  async function clearChats() {
    setClearing(true);
    try {
      await api("/api/conversations", { method: "DELETE" });
      shell.clearConversations();
      setConfirmClear(false);
      toast.success("All chats deleted.");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setClearing(false);
    }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    setDeleteError(null);
    setDeleting(true);
    try {
      await api("/api/me", { method: "DELETE", body: { password: deletePassword } });
      reloadTo("/");
    } catch (error) {
      setDeleteError(errorMessage(error));
      setDeleting(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar>
        <h1 className="px-2 text-[0.95rem] font-semibold">Settings</h1>
      </TopBar>
      <div className="scroll-area flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-2 pb-12">
          <Card>
            <CardHeader title="Profile" description={`Member since ${formatDate(memberSince)}.`} />
            <form onSubmit={saveName} className="flex flex-col gap-4 p-5">
              <Field label="Email address" htmlFor="settings-email">
                <Input id="settings-email" value={shell.user.email} readOnly disabled />
              </Field>
              <Field label="Name" htmlFor="settings-name" hint="Used to greet you. Optional.">
                <Input
                  id="settings-name"
                  value={name}
                  maxLength={60}
                  autoComplete="name"
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <div>
                <Button type="submit" loading={savingName} disabled={name.trim() === shell.user.name}>
                  Save changes
                </Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader title="Appearance" description="Choose how the interface looks on this device." />
            <div className="max-w-xs p-5">
              <ThemeToggle initial={shell.theme} />
            </div>
          </Card>

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
                <Button
                  type="submit"
                  loading={savingPassword}
                  disabled={!currentPassword || newPassword.length < 10}
                >
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

          <Card>
            <CardHeader title="Your data" description="Download or delete what is stored about you." />
            <div className="flex flex-col divide-y divide-border">
              <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Export data</p>
                  <p className="text-[0.8125rem] text-fg-muted">
                    A JSON file with your profile and all conversations.
                  </p>
                </div>
                <a href="/api/me/export" download className={buttonClass("secondary", "sm")}>
                  <Download size={15} />
                  Download
                </a>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Delete all chats</p>
                  <p className="text-[0.8125rem] text-fg-muted">
                    Permanently removes every conversation in your history.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmClear(true)}
                  disabled={shell.conversations.length === 0}
                >
                  Delete all
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-danger">Delete account</p>
                  <p className="text-[0.8125rem] text-fg-muted">
                    Permanently deletes your account and all associated data.
                  </p>
                </div>
                <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
                  Delete account
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Delete all chats?"
        confirmLabel="Delete all"
        danger
        loading={clearing}
        onConfirm={clearChats}
        onClose={() => setConfirmClear(false)}
      >
        This permanently deletes all {shell.conversations.length} of your conversations. This cannot
        be undone.
      </ConfirmDialog>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?">
        <form onSubmit={deleteAccount} className="flex flex-col gap-4">
          <p className="text-fg-muted">
            Your account, your conversations and your settings will be deleted permanently. Enter
            your password to confirm.
          </p>
          {deleteError ? <Alert>{deleteError}</Alert> : null}
          <Field label="Password" htmlFor="delete-password">
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              required
              value={deletePassword}
              onChange={(event) => setDeletePassword(event.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pb-2">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={deleting} disabled={!deletePassword}>
              Delete account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
