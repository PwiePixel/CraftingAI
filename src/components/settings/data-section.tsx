"use client";

import { useState, type FormEvent } from "react";
import { Download } from "lucide-react";
import { useShell } from "@/components/app/shell";
import { ConfirmDialog, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Button, Card, CardHeader, Field, Input, buttonClass } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { reloadTo } from "@/lib/client/navigate";

export function DataSection({ hasSubscription }: { hasSubscription: boolean }) {
  const shell = useShell();
  const toast = useToast();
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    <>
      <Card>
        <CardHeader title="Your data" description="Download or delete what is stored about you." />
        <div className="flex flex-col divide-y divide-border">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Export data</p>
              <p className="text-[0.8125rem] text-fg-muted">A JSON file with your profile and all conversations.</p>
            </div>
            <a href="/api/me/export" download className={buttonClass("secondary", "sm")}>
              <Download size={15} />
              Download
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="min-w-0">
              <p className="text-sm font-medium">Delete all chats</p>
              <p className="text-[0.8125rem] text-fg-muted">Permanently removes every conversation in your history.</p>
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

      <ConfirmDialog
        open={confirmClear}
        title="Delete all chats?"
        confirmLabel="Delete all"
        danger
        loading={clearing}
        onConfirm={clearChats}
        onClose={() => setConfirmClear(false)}
      >
        This permanently deletes all {shell.conversations.length} of your conversations. This cannot be
        undone.
      </ConfirmDialog>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?">
        <form onSubmit={deleteAccount} className="flex flex-col gap-4">
          <p className="text-fg-muted">
            Your account, your conversations and your settings will be deleted permanently. Enter your
            password to confirm.
          </p>
          {hasSubscription ? (
            <Alert tone="warning">
              You have a paid subscription. Cancel it under Plan first; deleting your account ends
              it as well, and the remaining paid time is not refunded.
            </Alert>
          ) : null}
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
    </>
  );
}
