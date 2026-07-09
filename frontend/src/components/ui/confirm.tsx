'use client';

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './modal';
import { Button } from './button';

type ConfirmTone = 'danger' | 'primary';

export type ConfirmOptions = {
  title?: string;
  /** Body text explaining what will happen. */
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Colors the confirm button — 'danger' for destructive actions. */
  tone?: ConfirmTone;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * App-wide confirmation dialog. Wrap the tree once (in providers) and call the
 * `useConfirm()` function anywhere: `if (await confirm({ ... })) { ... }`.
 * Replaces the native `window.confirm` with an on-brand modal.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((result: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  const tone: ConfirmTone = options?.tone ?? 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => settle(false)}
        title={options?.title ?? 'Are you sure?'}
        icon={<AlertTriangle className="h-5 w-5" />}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => settle(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button type="button" variant={tone} onClick={() => settle(true)}>
              {options?.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-6 text-muted-foreground">{options?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return ctx;
}
