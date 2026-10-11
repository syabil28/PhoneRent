import { useEffect, useState } from 'react';

/**
 * Pengganti polling. Setiap perubahan data memanggil bumpDataVersion(), lalu
 * layar yang berlangganan memuat ulang saat itu juga. Tanpa ini, layar harus
 * menembak database berkala walau tidak ada yang berubah.
 */
let version = 0;
let pending = false;
const listeners = new Set<(v: number) => void>();

/**
 * Satu aksi sering menulis ke beberapa tabel (misal sesi plus status unit).
 * Notifikasinya digabung supaya layar cukup memuat ulang sekali.
 */
export function bumpDataVersion(): void {
  if (pending) return;
  pending = true;
  setTimeout(() => {
    pending = false;
    version += 1;
    for (const listener of listeners) listener(version);
  }, 0);
}

export function subscribeDataVersion(listener: (v: number) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDataVersion(): number {
  return version;
}

/** Nilainya berubah tiap ada perubahan data, dipakai sebagai dependency efek pemuat. */
export function useDataVersion(): number {
  const [v, setV] = useState(version);
  useEffect(() => subscribeDataVersion(setV), []);
  return v;
}
