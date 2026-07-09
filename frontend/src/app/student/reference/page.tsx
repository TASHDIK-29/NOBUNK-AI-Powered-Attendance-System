"use client";

import { useState } from "react";
import { ScanFace, Upload } from "lucide-react";
import axios from "@/lib/axios";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  Button,
  ButtonLink,
  Field,
  FileInput,
  Panel,
  PageShell,
  Select,
  useToast,
} from "@/components/ui";

const PROFILE_TYPES = [
  { value: "default", label: "Default" },
  { value: "frontal", label: "Frontal" },
  { value: "side_left", label: "Side left" },
  { value: "side_right", label: "Side right" },
  { value: "low_light", label: "Low light" },
];

type SkippedFile = { filename: string; reason: string };

export default function StudentReferencePage() {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [profileType, setProfileType] = useState("default");
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!files || files.length === 0) {
      toast.error("Please choose one or more clear photos of yourself.");
      return;
    }

    setLoading(true);
    setSkipped([]);

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("files", file));
      formData.append("profile_type", profileType);

      const response = await axios.post("/api/v1/students/reference-images", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const savedCount = response.data.saved_count ?? 0;
      const skippedFiles: SkippedFile[] = response.data.skipped_files ?? [];
      setSkipped(skippedFiles);

      const message =
        `Saved ${savedCount} photo${savedCount === 1 ? "" : "s"}.` +
        (skippedFiles.length > 0
          ? ` ${skippedFiles.length} couldn't be used — see below.`
          : " You're all set to be recognized in class.");
      if (skippedFiles.length > 0) {
        toast.info(message);
      } else {
        toast.success(message);
      }
      setFiles(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const fileCount = files?.length ?? 0;

  return (
    <PageShell
      eyebrow="Student"
      title="Your face photos"
      description="Add a few clear photos of yourself so you can be recognized when your teacher takes attendance. More angles and lighting mean you're far less likely to be missed."
      actions={
        <ButtonLink href="/dashboard" variant="secondary">
          Back to dashboard
        </ButtonLink>
      }
    >
      <div className="mx-auto max-w-xl">
        <Panel
          title="Upload your photos"
          description="Add 3–5 photos: a clear front-facing shot plus a few from different angles and lighting. Make sure each photo shows only you."
          icon={<ScanFace className="h-5 w-5" />}
        >
          <form className="space-y-5" onSubmit={submit}>
            <Field
              label="Photo type"
              hint="Optional label to keep your front, side, and low-light photos organized."
            >
              <Select value={profileType} onChange={(e) => setProfileType(e.target.value)}>
                {PROFILE_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Your photos"
              hint="Each photo should clearly show just your face."
            >
              <FileInput
                multiple
                accept="image/*"
                onChange={(e) => setFiles(e.target.files)}
              />
              {fileCount > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{fileCount}</span> file
                  {fileCount === 1 ? "" : "s"} selected
                </p>
              ) : null}
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

            <Button type="submit" block loading={loading}>
              {!loading && <Upload className="h-4 w-4" />}
              {loading ? "Saving your photos..." : "Save my photos"}
            </Button>
          </form>
        </Panel>
      </div>
    </PageShell>
  );
}
