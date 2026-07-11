"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import axios from "@/lib/axios";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Button,
  ButtonLink,
  Field,
  Modal,
  Panel,
  PageShell,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { ImagePicker } from "@/components/image-picker";

type SkippedFile = { filename: string; reason: string };

type ReferenceStatus = { count: number; has_reference: boolean; max_images: number };

type CheckResult = {
  status: "good" | "ok" | "update_recommended";
  similarity: number;
  recommend_update: boolean;
  message: string;
};

/** Visual treatment for each self-check outcome. */
const RESULT_STYLE: Record<
  CheckResult["status"],
  { icon: typeof ShieldCheck; label: string; box: string; iconWrap: string }
> = {
  good: {
    icon: ShieldCheck,
    label: "Great match",
    box: "border-success/30 bg-success-soft",
    iconWrap: "bg-success text-white",
  },
  ok: {
    icon: CheckCircle2,
    label: "Looks good",
    box: "border-primary/30 bg-primary/5",
    iconWrap: "bg-primary text-primary-foreground",
  },
  update_recommended: {
    icon: AlertTriangle,
    label: "Consider updating",
    box: "border-warning/30 bg-warning-soft",
    iconWrap: "bg-warning text-white",
  },
};

export default function StudentReferencePage() {
  const toast = useToast();

  const [status, setStatus] = useState<ReferenceStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Self-check ("is my current look OK?") — shown in a modal.
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkFiles, setCheckFiles] = useState<File[]>([]);
  const [checkPickerKey, setCheckPickerKey] = useState(0);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  // Manage reference photos (replaces the stored set, max 3)
  const [files, setFiles] = useState<File[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);

  const loadStatus = useCallback(async () => {
    const res = await axios.get("/api/v1/students/reference-status");
    setStatus(res.data as ReferenceStatus);
    return res.data as ReferenceStatus;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadStatus();
      } catch (error) {
        toast.error(getErrorMessage(error));
      } finally {
        setStatusLoading(false);
      }
    })();
  }, [loadStatus, toast]);

  const runCheck = async (event: React.FormEvent) => {
    event.preventDefault();
    if (checkFiles.length === 0) {
      toast.error("Add a current photo of yourself to check.");
      return;
    }
    setChecking(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", checkFiles[0]);
      const res = await axios.post("/api/v1/students/face-check", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data as CheckResult);
      setCheckFiles([]);
      setCheckPickerKey((k) => k + 1);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setChecking(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (files.length === 0) {
      toast.error("Please choose one or more clear photos of yourself.");
      return;
    }
    setSaving(true);
    setSkipped([]);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));

      const response = await axios.post("/api/v1/students/reference-images", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const savedCount = response.data.saved_count ?? 0;
      const skippedFiles: SkippedFile[] = response.data.skipped_files ?? [];
      const replaced = Boolean(response.data.replaced_previous);
      setSkipped(skippedFiles);

      const base = replaced
        ? `Replaced your photos with ${savedCount} new one${savedCount === 1 ? "" : "s"}.`
        : `Saved ${savedCount} photo${savedCount === 1 ? "" : "s"}.`;
      const message =
        base +
        (skippedFiles.length > 0
          ? ` ${skippedFiles.length} couldn't be used — see below.`
          : " You're all set to be recognized in class.");
      if (skippedFiles.length > 0) toast.info(message);
      else toast.success(message);

      setFiles([]);
      setPickerKey((k) => k + 1);
      setResult(null); // stored set changed — any prior check is stale
      await loadStatus();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const maxImages = status?.max_images ?? 3;
  const hasReference = status?.has_reference ?? false;

  return (
    <PageShell
      eyebrow="Student"
      title="Upload Your Reference Photos"
      description="Keep a few clear photos of yourself so you're recognized when your teacher takes attendance — and check anytime whether your current look still matches."
      actions={
        <>
          {hasReference ? (
            <Button type="button" variant="secondary" onClick={() => setCheckOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Check Current Look
            </Button>
          ) : null}
          <ButtonLink href="/dashboard" variant="secondary">
            Back to dashboard
          </ButtonLink>
        </>
      }
    >
      <div className="mx-auto max-w-xl space-y-6">
        {/* Manage reference photos */}
        <Panel
          title="Your reference photos"
          description={`Save up to ${maxImages} clear, front-facing photos. Saving replaces the photos you had before.`}
          icon={<ScanFace className="h-5 w-5" />}
        >
          {!statusLoading ? (
            <p className="mb-4 text-sm text-muted-foreground">
              {hasReference ? (
                <>
                  You currently have{" "}
                  <span className="font-semibold text-foreground">{status?.count}</span> photo
                  {status?.count === 1 ? "" : "s"} saved.
                </>
              ) : (
                "You haven't saved any reference photos yet."
              )}
            </p>
          ) : null}

          <form className="space-y-5" onSubmit={save}>
            <Field
              label="Your photos"
              hint="Browse your gallery or take photos with your camera. Each photo should clearly show just your face."
            >
              <ImagePicker
                key={pickerKey}
                onChange={setFiles}
                defaultFacingMode="user"
                maxImages={maxImages}
              />
            </Field>

            {skipped.length > 0 ? (
              <div className="rounded-lg border border-border bg-surface p-3 text-xs">
                <p className="mb-2 font-medium text-foreground">Photos we could not use</p>
                <ul className="space-y-1 text-muted-foreground">
                  {skipped.map((s, i) => (
                    <li key={`${s.filename}-${i}`}>
                      <span className="font-medium text-foreground">{s.filename}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Button type="submit" block loading={saving} disabled={files.length === 0}>
              {!saving && <Upload className="h-4 w-4" />}
              {saving
                ? "Saving your photos…"
                : hasReference
                  ? "Replace my photos"
                  : "Save my photos"}
            </Button>
          </form>
        </Panel>
      </div>

      {/* Self-check modal */}
      <Modal
        open={checkOpen}
        onClose={() => setCheckOpen(false)}
        title="Check your current look"
        description="Upload or take a photo of how you look right now and we'll tell you if it still matches your saved photos."
        icon={<Sparkles className="h-5 w-5" />}
      >
        <form className="space-y-4" onSubmit={runCheck}>
          <ImagePicker
            key={checkPickerKey}
            onChange={setCheckFiles}
            defaultFacingMode="user"
            maxImages={1}
          />

          {result ? <ResultCard result={result} /> : null}

          <Button type="submit" block loading={checking} disabled={checkFiles.length === 0}>
            {!checking && <Sparkles className="h-4 w-4" />}
            {checking ? "Checking…" : "Check my look"}
          </Button>
        </form>
      </Modal>
    </PageShell>
  );
}

/** The verdict box shown after a self-check. */
function ResultCard({ result }: { result: CheckResult }) {
  const style = RESULT_STYLE[result.status];
  const Icon = style.icon;
  const percent = Math.round(result.similarity * 100);

  return (
    <div className={cn("rounded-xl border p-4", style.box)}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            style.iconWrap
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{style.label}</span>
            <span className="text-xs text-muted-foreground">· {percent}% match</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{result.message}</p>
          {result.recommend_update ? (
            <p className="mt-2 text-xs font-medium text-foreground">
              Use “Your reference photos” below to upload fresh photos.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
