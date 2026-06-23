'use client';

import { useEffect } from 'react';

/**
 * App-level error boundary. Server actions in this app surface validation,
 * permission, and concurrency problems by throwing; this turns those into a
 * readable, recoverable screen instead of a blank crash.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Hook for client-side logging if you add it later.
    console.error(error);
  }, [error]);

  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ maxWidth: 520 }}>
        <p className="eyebrow">Something needs another look</p>
        <h2>We couldn&apos;t complete that</h2>
        <p style={{ marginBottom: 18 }}>{error.message || 'An unexpected error occurred. Please try again.'}</p>
        <div className="actions">
          <button className="button" onClick={() => reset()}>Try again</button>
          <a className="button secondary" href="/dashboard">Back to dashboard</a>
        </div>
      </div>
    </div>
  );
}
