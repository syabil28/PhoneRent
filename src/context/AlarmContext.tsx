import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { listActiveSessions, listPausedSessions } from '../db/sessions.repo';
import { listUnits } from '../db/units.repo';
import { subscribeDataVersion } from '../db/dataVersion';
import { ensureAlarmPlaying, playAlarm, stopAlarm } from '../audio/alarmManager';
import { DEFAULT_ALARM_SETTINGS, getAlarmSettings } from '../settings/alarmSettings';
import type { AlarmSettings } from '../settings/alarmSettings';
import { remainingMinutes } from '../utils/billing';
import { subscribeTick } from '../utils/ticker';
import { startForegroundService, stopForegroundService } from '../background/foregroundService';
import type { RentalSession, Unit } from '../types/models';

export interface RingingAlarm {
  sessionId: number;
  unitId: number;
  unitName: string;
  customerName: string;
}

interface AlarmContextValue {
  ringingAlarms: RingingAlarm[];
  dismissAlarm: (sessionId: number) => void;
  reloadSettings: () => void;
}

const AlarmContext = createContext<AlarmContextValue>({
  ringingAlarms: [],
  dismissAlarm: () => {},
  reloadSettings: () => {},
});

export function useAlarms() {
  return useContext(AlarmContext);
}

export function AlarmProvider({ children }: { children: ReactNode }) {
  const [ringingAlarms, setRingingAlarms] = useState<RingingAlarm[]>([]);
  const settingsRef = useRef<AlarmSettings>(DEFAULT_ALARM_SETTINGS);
  // sessionId -> plannedMinutes saat alarm terakhir dibunyikan. Kalau durasi sesi
  // bertambah (tambah durasi / ganti perangkat), alarm dipersenjatai ulang.
  const triggeredRef = useRef<Map<number, number>>(new Map());
  const ringingRef = useRef<RingingAlarm[]>([]);
  // Cuplikan data terakhir. Diperbarui saat ada perubahan, bukan tiap detik,
  // sehingga pengecekan waktu tiap detik tidak menyentuh database sama sekali.
  const snapshotRef = useRef<{ active: RentalSession[]; unitsById: Record<number, Unit> }>({
    active: [],
    unitsById: {},
  });

  const reloadSettings = useCallback(() => {
    getAlarmSettings()
      .then((s) => {
        settingsRef.current = s;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    reloadSettings();
  }, [reloadSettings]);

  const applyRinging = useCallback((next: RingingAlarm[]) => {
    ringingRef.current = next;
    setRingingAlarms(next);
    if (next.length > 0) {
      playAlarm(settingsRef.current);
    } else {
      stopAlarm();
    }
  }, []);

  // Muat ulang cuplikan hanya ketika data berubah.
  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const [active, paused, units] = await Promise.all([
          listActiveSessions(),
          listPausedSessions(),
          listUnits(),
        ]);
        if (cancelled) return;

        snapshotRef.current = {
          active,
          unitsById: Object.fromEntries(units.map((u) => [u.id, u])),
        };

        const ongoingCount = active.length + paused.length;
        if (ongoingCount > 0) {
          startForegroundService(ongoingCount);
        } else {
          stopForegroundService();
        }

        const activeIds = new Set(active.map((s) => s.id));
        for (const id of triggeredRef.current.keys()) {
          if (!activeIds.has(id)) triggeredRef.current.delete(id);
        }

        const stillRinging = ringingRef.current.filter((r) => activeIds.has(r.sessionId));
        if (stillRinging.length !== ringingRef.current.length) applyRinging(stillRinging);
      } catch (e) {
        console.warn('alarm snapshot refresh failed (non-fatal):', e);
      }
    };

    refresh();
    const unsubscribe = subscribeDataVersion(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [applyRinging]);

  // Pengecekan waktu tiap detik, murni hitungan atas cuplikan di memori.
  useEffect(
    () =>
      subscribeTick((now) => {
        const { active, unitsById } = snapshotRef.current;
        const prev = ringingRef.current;
        let next = prev;

        for (const session of active) {
          const planned = session.plannedMinutes ?? 0;
          const triggeredFor = triggeredRef.current.get(session.id);
          if (triggeredFor != null && triggeredFor >= planned) continue;
          if (remainingMinutes(session, now) > 0) continue;

          triggeredRef.current.set(session.id, planned);
          if (!next.some((r) => r.sessionId === session.id)) {
            const unit = unitsById[session.unitId];
            next = [
              ...next,
              {
                sessionId: session.id,
                unitId: session.unitId,
                unitName: unit ? unit.name : `Unit #${session.unitId}`,
                customerName: session.customerName,
              },
            ];
          }
        }

        if (next !== prev) {
          applyRinging(next);
        } else if (next.length > 0) {
          // Jaga-jaga kalau sistem menghentikan pemutar di tengah jalan.
          ensureAlarmPlaying(settingsRef.current);
        }
      }),
    [applyRinging]
  );

  const dismissAlarm = useCallback(
    (sessionId: number) => {
      applyRinging(ringingRef.current.filter((r) => r.sessionId !== sessionId));
    },
    [applyRinging]
  );

  return (
    <AlarmContext.Provider value={{ ringingAlarms, dismissAlarm, reloadSettings }}>
      {children}
    </AlarmContext.Provider>
  );
}
