import { useEffect, useRef } from 'react';

// Log out after a period without activity (System Design 4.8.2, Table 14:
// IDLE_TIMEOUT_MIN = 30). The server session itself lasts at most 8 hours.

const IDLE_MINUTES = Number(import.meta.env.VITE_IDLE_TIMEOUT_MIN) || 30;
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

export default function useIdleLogout(onIdle, minutes = IDLE_MINUTES) {
  const lastActivity = useRef(Date.now());
  const callback = useRef(onIdle);

  useEffect(() => {
    callback.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    const markActive = () => { lastActivity.current = Date.now(); };
    EVENTS.forEach((name) => window.addEventListener(name, markActive, { passive: true }));

    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= minutes * 60 * 1000) {
        window.clearInterval(timer);
        callback.current();
      }
    }, 30 * 1000);

    return () => {
      window.clearInterval(timer);
      EVENTS.forEach((name) => window.removeEventListener(name, markActive));
    };
  }, [minutes]);
}
