"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check, Copy, UserPlus } from "lucide-react";
import { ConfirmDialog, Modal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Alert, Badge, Button, Field, Input, Select } from "@/components/ui";
import { api, errorMessage } from "@/lib/client/api";
import { formatDate, formatInt, formatUsd } from "@/lib/shared/format";
import type { AdminUserRow } from "@/lib/server/stats";
import { Td, Th } from "./page-header";

function SecretBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-2 py-1.5 pr-1.5 pl-3.5">
      <code className="min-w-0 flex-1 font-mono text-sm break-all">{value}</code>
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          } catch {
            // Clipboard unavailable: the value can still be selected by hand.
          }
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function UsersManager({
  rows,
  currentUserId,
  plans,
}: {
  rows: AdminUserRow[];
  currentUserId: string;
  /** Selectable plans: identifier and name, the free plan first. */
  plans: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();

  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [role, setRole] = useState<"user" | "admin">("user");
  const [status, setStatus] = useState<"active" | "suspended">("active");
  const [multiplier, setMultiplier] = useState("1");
  const [planId, setPlanId] = useState("free");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function open(row: AdminUserRow) {
    setSelected(row);
    setRole(row.role);
    setStatus(row.status);
    setMultiplier(String(row.limitMultiplier));
    setPlanId(plans.some((plan) => plan.id === row.planId) ? row.planId : "free");
    setFormError(null);
  }

  const isSelf = selected?.id === currentUserId;
  const paysForPlan = selected?.planSource === "stripe" && selected.planId !== "free";
  const planName = (row: AdminUserRow) =>
    row.planSource === "none" ? plans[0]?.name : (plans.find((plan) => plan.id === row.planId)?.name ?? row.planId);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const limitMultiplier = Number(multiplier);
    if (!Number.isFinite(limitMultiplier) || limitMultiplier < 0 || limitMultiplier > 1000) {
      setFormError("The limit multiplier must be a number between 0 and 1000.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await api(`/api/admin/users/${selected.id}`, {
        method: "PATCH",
        body: {
          limitMultiplier,
          ...(paysForPlan ? {} : { planId }),
          ...(isSelf ? {} : { role, status }),
        },
      });
      toast.success("User updated.");
      setSelected(null);
      router.refresh();
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!selected) return;
    try {
      const result = await api<{ temporaryPassword: string }>(
        `/api/admin/users/${selected.id}/reset-password`,
        { method: "POST" },
      );
      setSecret({ email: selected.email, password: result.temporaryPassword });
      setSelected(null);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  }

  async function remove() {
    if (!selected) return;
    setDeleting(true);
    try {
      await api(`/api/admin/users/${selected.id}`, { method: "DELETE" });
      toast.success("User deleted.");
      setConfirmDelete(false);
      setSelected(null);
      router.refresh();
    } catch (error) {
      setConfirmDelete(false);
      setFormError(errorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const result = await api<{ temporaryPassword: string }>("/api/admin/users", {
        body: { email: newEmail, name: newName, role: newRole },
      });
      setSecret({ email: newEmail.trim().toLowerCase(), password: result.temporaryPassword });
      setCreateOpen(false);
      setNewEmail("");
      setNewName("");
      setNewRole("user");
      router.refresh();
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <UserPlus size={15} />
          Add user
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th align="right">Today</Th>
                <Th align="right">30 days</Th>
                <Th align="right">Est. spend</Th>
                <Th>Joined</Th>
                <Th>Last sign-in</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-fg-muted">
                    No users found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <Td>
                      <span className="block max-w-[15rem] truncate font-medium">{row.email}</span>
                      {row.name ? (
                        <span className="block max-w-[15rem] truncate text-xs text-fg-muted">{row.name}</span>
                      ) : null}
                    </Td>
                    <Td>{row.role === "admin" ? <Badge tone="accent">Admin</Badge> : <Badge>User</Badge>}</Td>
                    <Td className="whitespace-nowrap">
                      {planName(row)}
                      {row.planSource === "stripe" ? (
                        <span className="block text-xs text-fg-muted">paid · {row.planStatus ?? "unknown"}</span>
                      ) : row.planSource === "manual" ? (
                        <span className="block text-xs text-fg-muted">assigned</span>
                      ) : null}
                    </Td>
                    <Td>
                      {row.status === "active" ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="danger">Suspended</Badge>
                      )}
                    </Td>
                    <Td align="right">{formatInt(row.messagesToday)}</Td>
                    <Td align="right">{formatInt(row.messages30d)}</Td>
                    <Td align="right">{formatUsd(row.cost30dUsd)}</Td>
                    <Td className="whitespace-nowrap text-fg-muted">{formatDate(row.createdAt)}</Td>
                    <Td className="whitespace-nowrap text-fg-muted">{formatDate(row.lastLoginAt)}</Td>
                    <Td align="right">
                      <Button variant="secondary" size="sm" onClick={() => open(row)}>
                        Manage
                      </Button>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={selected !== null} onClose={() => setSelected(null)} title="Manage user">
        {selected ? (
          <form onSubmit={save} className="flex flex-col gap-4 pb-2">
            <p className="text-fg-muted">
              <span className="font-medium text-fg">{selected.email}</span>
              {isSelf ? " (you)" : ""} · {formatInt(selected.conversations)} conversations
            </p>
            {formError ? <Alert>{formError}</Alert> : null}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Role" htmlFor="user-role">
                <Select
                  id="user-role"
                  value={role}
                  disabled={isSelf}
                  onChange={(event) => setRole(event.target.value as "user" | "admin")}
                >
                  <option value="user">User</option>
                  <option value="admin">Administrator</option>
                </Select>
              </Field>
              <Field label="Status" htmlFor="user-status">
                <Select
                  id="user-status"
                  value={status}
                  disabled={isSelf}
                  onChange={(event) => setStatus(event.target.value as "active" | "suspended")}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </Select>
              </Field>
            </div>
            <Field
              label="Plan"
              htmlFor="user-plan"
              hint={
                paysForPlan
                  ? "This user pays for a subscription. The plan follows the subscription and cannot be changed here."
                  : "Assigns a plan without payment, for example for team members or as a gift."
              }
            >
              <Select
                id="user-plan"
                value={planId}
                disabled={paysForPlan}
                onChange={(event) => setPlanId(event.target.value)}
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Limit multiplier"
              htmlFor="user-multiplier"
              hint="Scales this user's daily message limits. 1 is the default, 2 doubles them, 0 blocks sending."
            >
              <Input
                id="user-multiplier"
                type="number"
                min={0}
                max={1000}
                step="0.1"
                value={multiplier}
                onChange={(event) => setMultiplier(event.target.value)}
              />
            </Field>
            {isSelf ? (
              <p className="text-xs text-fg-muted">You cannot change your own role or status.</p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={resetPassword}>
                  Reset password
                </Button>
                {!isSelf ? (
                  <Button variant="ghost" size="sm" className="text-danger" onClick={() => setConfirmDelete(true)}>
                    Delete
                  </Button>
                ) : null}
              </div>
              <Button type="submit" loading={saving}>
                Save
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete user?"
        confirmLabel="Delete user"
        danger
        loading={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      >
        This permanently deletes <strong className="text-fg">{selected?.email}</strong> and all of
        their conversations. This cannot be undone.
      </ConfirmDialog>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add user">
        <form onSubmit={create} className="flex flex-col gap-4 pb-2">
          {createError ? <Alert>{createError}</Alert> : null}
          <Field label="Email address" htmlFor="new-user-email">
            <Input
              id="new-user-email"
              type="email"
              required
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
            />
          </Field>
          <Field label="Name (optional)" htmlFor="new-user-name">
            <Input id="new-user-name" maxLength={60} value={newName} onChange={(event) => setNewName(event.target.value)} />
          </Field>
          <Field label="Role" htmlFor="new-user-role">
            <Select
              id="new-user-role"
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as "user" | "admin")}
            >
              <option value="user">User</option>
              <option value="admin">Administrator</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={creating} disabled={!newEmail}>
              Create user
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={secret !== null} onClose={() => setSecret(null)} title="Temporary password">
        {secret ? (
          <div className="flex flex-col gap-3 pb-3">
            <p className="text-fg-muted">
              Pass this temporary password to <span className="font-medium text-fg">{secret.email}</span>{" "}
              through a secure channel and ask them to change it after signing in. It is shown only
              once.
            </p>
            <SecretBox value={secret.password} />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
