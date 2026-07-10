import {
  ArrowRight,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  UserCheck,
  Zap,
} from 'lucide-react';
import { ButtonLink, Card } from '@/components/ui';

const features = [
  {
    icon: ShieldCheck,
    title: 'Private & secure',
    desc: 'Student photos stay safe and are never shared outside your institution.',
  },
  {
    icon: Target,
    title: 'Accurate every class',
    desc: 'Faces are only matched against students in that class, so results stay reliable.',
  },
  {
    icon: UserCheck,
    title: 'Always in your control',
    desc: 'Someone missed in a dim or crowded photo? Fix any record by hand in seconds.',
  },
  {
    icon: Zap,
    title: 'Ready in seconds',
    desc: 'Attendance is marked right after you upload your class photos.',
  },
];

const steps = [
  {
    icon: ScanFace,
    title: 'Add your photo',
    desc: 'Students upload a few clear photos of themselves — that is all it takes to be recognized.',
  },
  {
    icon: UploadCloud,
    title: 'Snap the class',
    desc: 'Teachers take one or more photos of the class and upload them in a single step.',
  },
  {
    icon: UserCheck,
    title: 'Done — and yours to adjust',
    desc: 'Everyone is marked automatically, and you can correct any record whenever you need.',
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="relative overflow-hidden py-16 sm:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-128 w-lg -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-muted-foreground shadow-soft">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Face recognition attendance, done right
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
            NoBunk —{' '}
            <span className="bg-linear-to-r from-primary to-indigo-400 bg-clip-text text-transparent">
              reliable, private, fast
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Take attendance in seconds. Snap a photo of your class and let face
            recognition mark everyone present — accurately and privately.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/auth/register" size="lg">
              Create account
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/auth/login" variant="secondary" size="lg">
              Log in
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="grid gap-4 pb-16 sm:grid-cols-2 lg:grid-cols-4">
        {features.map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="p-6 transition hover:shadow-elevated">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{desc}</p>
          </Card>
        ))}
      </section>

      {/* How it works */}
      <section className="pb-24">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            How it works
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Three simple steps from sign-up to a complete attendance record.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, desc }, i) => (
            <Card key={title} className="relative p-6">
              <span className="absolute right-5 top-5 text-5xl font-bold text-surface-muted">
                {i + 1}
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{desc}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
