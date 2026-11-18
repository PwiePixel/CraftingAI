"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Avatar } from "@/components/app/avatar";
import { useShell } from "@/components/app/shell";
import { useToast } from "@/components/toast";
import { Button, Card, CardHeader, Field, Input } from "@/components/ui";
import { api, errorMessage, toApiError } from "@/lib/client/api";
import { formatDate } from "@/lib/shared/format";

const PICTURE_SIZE = 512;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

/**
 * Crops the chosen picture to a centred square and scales it down in the
 * browser, so only a small file is uploaded. The server processes it again.
 */
async function prepare(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = PICTURE_SIZE;
    canvas.height = PICTURE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      PICTURE_SIZE,
      PICTURE_SIZE,
    );
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file; // let the server decide whether it can read the file
  }
}

export function ProfileSection({ memberSince }: { memberSince: number }) {
  const { user } = useShell();
  const toast = useToast();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user.name);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api("/api/me", { method: "PATCH", body: { name } });
      toast.success("Profile updated.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function onPicture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow choosing the same file again
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error("Please choose a PNG, JPEG or WebP image.");
      return;
    }
    setUploading(true);
    try {
      const picture = await prepare(file);
      const response = await fetch("/api/me/avatar", {
        method: "PUT",
        headers: { "Content-Type": picture.type || file.type },
        credentials: "same-origin",
        body: picture,
      });
      if (!response.ok) throw await toApiError(response);
      toast.success("Profile picture updated.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function removePicture() {
    setUploading(true);
    try {
      await api("/api/me/avatar", { method: "DELETE" });
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Profile" description={`Member since ${formatDate(memberSince)}.`} />
      <div className="flex flex-wrap items-center gap-5 border-b border-border p-5">
        <Avatar user={user} size={72} />
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-sm font-medium">Profile picture</p>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED.join(",")}
              className="sr-only"
              aria-label="Choose a profile picture"
              onChange={onPicture}
            />
            <Button variant="secondary" size="sm" loading={uploading} onClick={() => fileInput.current?.click()}>
              <Camera size={15} />
              {user.avatarVersion ? "Change picture" : "Upload picture"}
            </Button>
            {user.avatarVersion ? (
              <Button variant="ghost" size="sm" disabled={uploading} onClick={removePicture}>
                <Trash2 size={15} />
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-fg-muted">PNG, JPEG or WebP. It is cropped to a square and only you can see it.</p>
        </div>
      </div>
      <form onSubmit={saveName} className="flex flex-col gap-4 p-5">
        <Field label="Email address" htmlFor="settings-email">
          <Input id="settings-email" value={user.email} readOnly disabled />
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
          <Button type="submit" loading={saving} disabled={name.trim() === user.name}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}
