"use client";

import Link from "next/link";
import { ArrowRight, GraduationCap, ScanFace, Upload, UserRound } from "lucide-react";
import { useAppSelector } from "@/store/hooks";
import { Avatar, Badge, ButtonLink, Card, PageShell } from "@/components/ui";

type QuickLink = {
  href: string;
  label: string;
  description: string;
  icon: typeof Upload;
};

const teacherQuickLinks: QuickLink[] = [
  {
    href: "/teacher/courses",
    label: "Courses",
    description: "Create courses and manage your students.",
    icon: GraduationCap,
  },
  {
    href: "/teacher/attendance",
    label: "Take attendance",
    description: "Upload class photos to mark who's present.",
    icon: Upload,
  },
  {
    href: "/teacher/join-requests",
    label: "Join requests",
    description: "Approve students asking to join a course.",
    icon: UserRound,
  },
];

const studentQuickLinks: QuickLink[] = [
  {
    href: "/student/courses",
    label: "My courses",
    description: "Browse courses and view your attendance.",
    icon: GraduationCap,
  },
  {
    href: "/student/reference",
    label: "My photos",
    description: "Add photos so you're recognized in class.",
    icon: ScanFace,
  },
];

export default function DashboardPage() {
  const auth = useAppSelector((state) => state.auth);
  const role = auth.user?.role || "guest";
  const isTeacher = role === "teacher" || role === "admin";
  const quickLinks = isTeacher
    ? teacherQuickLinks
    : role === "student"
      ? studentQuickLinks
      : [];
  const firstName = auth.user?.full_name?.split(" ")[0];

  return (
    <PageShell
      eyebrow="Dashboard"
      title={firstName ? `Welcome back, ${firstName}` : "Your workspace"}
      description="Everything you need, a tap away."
    >
      <div className="space-y-6">
        {/* Identity / sign-in strip */}
        {auth.isAuthenticated ? (
          <Card className="flex items-center gap-4 p-5">
            <Avatar name={auth.user?.full_name} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">
                {auth.user?.full_name || "Your account"}
              </div>
              <div className="truncate text-sm text-muted-foreground">
                {auth.user?.email}
              </div>
            </div>
            <Badge variant="success" className="ml-auto shrink-0 capitalize">
              {role}
            </Badge>
          </Card>
        ) : (
          <Card className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-lg font-semibold">You&apos;re not signed in</div>
              <div className="text-sm text-muted-foreground">
                Log in or create an account to get started.
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <ButtonLink href="/auth/login" variant="secondary">
                Log in
              </ButtonLink>
              <ButtonLink href="/auth/register">Create account</ButtonLink>
            </div>
          </Card>
        )}

        {/* Quick actions */}
        {quickLinks.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quickLinks.map(({ href, label, description, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-soft transition hover:border-ring/50 hover:shadow-elevated"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <div className="flex items-center gap-1.5 font-semibold">
                    {label}
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
