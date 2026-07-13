/**
 * Build-time public configuration (NEXT_PUBLIC_* values are inlined at build).
 *
 * The public deployment runs a LIGHTWEIGHT backend without the face-recognition
 * stack, so set `NEXT_PUBLIC_AI_ENABLED=false` on Vercel. Left unset (local dev)
 * it defaults to enabled, so the full AI features work normally.
 */
export const AI_ENABLED = process.env.NEXT_PUBLIC_AI_ENABLED !== 'false';

/** Public source repo — shown in the "AI runs locally" notice so people can run it. */
export const REPO_URL =
  process.env.NEXT_PUBLIC_REPO_URL ||
  'https://github.com/TASHDIK-29/NOBUNK-AI-Powered-Attendance-System';
