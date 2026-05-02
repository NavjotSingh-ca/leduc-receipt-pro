'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

export default function Providers({ children }: { children: React.ReactNode }) {
  // Register Service Worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch((err) => {
          console.error('Service Worker registration failed:', err);
        });
      });
    }
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 2,       // 2 minutes — Supabase Realtime supplements for live updates
            gcTime: 1000 * 60 * 10,          // 10 minutes garbage collection
            retry: 2,
            refetchOnWindowFocus: false,      // Use Supabase Realtime instead of refetch-on-focus
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
