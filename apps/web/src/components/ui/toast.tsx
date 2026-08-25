import { useEffect } from 'react';

export function Toast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 3000);
    return () => window.clearTimeout(timer);
    // Parent often passes an inline onDismiss; dismiss by message so the timer is not reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  return (
    <div
      role="status"
      className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-md border bg-background px-4 py-2 text-sm font-medium shadow-lg"
    >
      {message}
    </div>
  );
}
