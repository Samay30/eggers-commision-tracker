'use client';

import type { ReactNode } from 'react';

/**
 * Submit button that asks for confirmation before letting its parent
 * server-action <form> submit. Used for deletes and other destructive ops.
 */
export function ConfirmSubmit({
  children,
  message,
  className = 'button danger'
}: {
  children: ReactNode;
  message: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}
