'use client';

import { useEffect } from 'react';
import { Provider, useDispatch } from 'react-redux';
import { store } from '@/store';
import type { AppDispatch } from '@/store';
import { setUser, clearUser } from '@/store/slices/authSlice';
import axios from '@/lib/axios';
import { ThemeProvider } from '@/components/theme-provider';
import { ToastProvider, ConfirmProvider } from '@/components/ui';

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const dispatch = useDispatch<AppDispatch>();

  // Ask the server who we are: the session cookie is validated server-side, so
  // this both restores the user after a refresh and confirms the session is
  // still live. Never trust client storage for auth state.
  useEffect(() => {
    let active = true;
    axios
      .get('/api/v1/auth/me')
      .then((res) => {
        if (active) dispatch(setUser(res.data));
      })
      .catch(() => {
        if (active) dispatch(clearUser());
      });
    return () => {
      active = false;
    };
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
