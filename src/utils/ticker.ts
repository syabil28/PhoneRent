import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Satu timer detik untuk seluruh aplikasi. Sebelumnya tiap kartu hitung mundur
 * membuat setInterval sendiri, jadi sepuluh kartu berarti sepuluh timer yang
 * fasenya berbeda beda dan memicu render bergantian sepanjang waktu.
 */
const listeners = new Set<(now: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function start() {
  if (timer) return;
  timer = setInterval(() => {
    const now = Date.now();
    for (const listener of listeners) listener(now);
  }, 1000);
}

function stopIfIdle() {
  if (timer && listeners.size === 0) {
    clearInterval(timer);
    timer = null;
  }
}

export function subscribeTick(listener: (now: number) => void): () => void {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
    stopIfIdle();
  };
}

/**
 * Jam yang maju tiap detik untuk tampilan. Detaknya berhenti saat komponennya
 * tidak terlihat: layar yang tertutup layar lain, atau aplikasi di latar belakang.
 * Pemantau alarm tidak memakai hook ini, jadi pengecekan waktu tetap jalan terus.
 */
export function useNow(enabled = true): number {
  const [now, setNow] = useState(Date.now);
  const [appActive, setAppActive] = useState(() => AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!enabled || !appActive) return;
    setNow(Date.now());
    return subscribeTick(setNow);
  }, [enabled, appActive]);

  return now;
}
