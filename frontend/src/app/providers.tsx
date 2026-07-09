'use client';

import { useEffect } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { store } from '@/store';
import type { AppDispatch } from '@/store';
import { loadUserFromStorage } from '@/store/slices/authSlice';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider, ConfirmProvider } from '@/components/ui';

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    dispatch(loadUserFromStorage());
  }, [dispatch]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthBootstrap>{children}</AuthBootstrap>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </Provider>
  );
}
