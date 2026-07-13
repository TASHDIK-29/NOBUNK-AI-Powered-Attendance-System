'use client';

import { useCallback } from 'react';

import { useToast } from '@/components/ui/toast';
import { AI_ENABLED, REPO_URL } from '@/lib/app-config';

/**
 * Guard for actions that need the face-recognition backend (upload attendance
 * photos, reference photos, self-check, review). In the lightweight public demo
 * (`NEXT_PUBLIC_AI_ENABLED=false`) these are disabled: `requireAi()` shows a
 * toast pointing to the repo and returns false so the caller can bail out before
 * making a request that would only 503.
 */
export function useAiGuard() {
  const toast = useToast();

  const requireAi = useCallback((): boolean => {
    if (AI_ENABLED) return true;
    toast.info(
      'Face-recognition runs in the local demo only. Clone the repo to run the full AI system — the README walks you through setup.',
      { href: REPO_URL, label: 'Open the GitHub repo →' }
    );
    return false;
  }, [toast]);

  return { aiEnabled: AI_ENABLED, requireAi };
}
