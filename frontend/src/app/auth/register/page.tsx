"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap, UserPlus } from "lucide-react";
import axios from "@/lib/axios";
import { getErrorMessage } from "@/lib/get-error-message";
import { Button, Field, Input, useToast } from "@/components/ui";
import { AuthLayout } from "@/components/auth-layout";
import { cn } from "@/lib/cn";

type Role = "student" | "teacher";

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();
  const [role, setRole] = useState<Role>("student");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    student_id: "",
    department: "",
    session_year: "",
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const payload = {
        ...form,
        role,
        student_id: role === "student" ? form.student_id || undefined : undefined,
        department: form.department || undefined,
        session_year: role === "student" ? form.session_year || undefined : undefined,
      };

      const response = await axios.post("/api/v1/auth/register", payload);
      toast.success(`Account created for ${response.data.full_name}. You can now log in.`);
      setForm({ full_name: "", email: "", password: "", student_id: "", department: "", session_year: "" });
      router.replace("/auth/login");
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Join NoBunk in minutes">
      <form className="space-y-5" onSubmit={submit}>
        {/* Role selector — segmented control */}
        <Field label="I am a">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-muted p-1">
            {(["student", "teacher"] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold capitalize transition",
                  role === r
                    ? "bg-surface text-primary shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {r === "student" ? (
                  <GraduationCap className="h-4 w-4" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {r}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Full name" htmlFor="full_name">
          <Input
            id="full_name"
            value={form.full_name}
            onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))}
            placeholder="Ayesha Khan"
            required
          />
        </Field>

        <Field label="Email address" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="name@college.edu"
            required
          />
        </Field>

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            placeholder="Create a secure password"
            required
          />
        </Field>

        {role === "student" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Student ID" htmlFor="student_id">
              <Input
                id="student_id"
                value={form.student_id}
                onChange={(e) => setForm((p) => ({ ...p, student_id: e.target.value }))}
                placeholder="2026-001"
              />
            </Field>
            <Field label="Session year" htmlFor="session_year">
              <Input
                id="session_year"
                value={form.session_year}
                onChange={(e) => setForm((p) => ({ ...p, session_year: e.target.value }))}
                placeholder="2025-2029"
              />
            </Field>
          </div>
        ) : null}

        <Field label="Department" htmlFor="department">
          <Input
            id="department"
            value={form.department}
            onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))}
            placeholder="Computer Science"
          />
        </Field>

        <Button type="submit" block loading={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Already registered?{" "}
          <Link href="/auth/login" className="font-semibold text-primary hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
