import { useCallback, useEffect, useRef, useState } from 'react';

// Short-lived success / error feedback (FR-24, wireframe page 09).
export default function useToast(duration = 4000) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const showToast = useCallback((type, text) => {
    setToast({ type, text });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), duration);
  }, [duration]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return [toast, showToast];
}
