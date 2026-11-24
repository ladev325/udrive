import { useCallback, useEffect, useRef, useState } from 'react';

export default function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message, type = 'success') => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((current) => [...current.slice(-3), { id, message, type }]);
      const timer = window.setTimeout(() => dismiss(id), 3800);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      currentTimers.forEach((timer) => window.clearTimeout(timer));
      currentTimers.clear();
    };
  }, []);

  return { toasts, notify, dismiss };
}
