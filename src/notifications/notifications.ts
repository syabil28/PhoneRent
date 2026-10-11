import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ALARM_SOUNDS } from '../audio/alarmSounds';
import type { AlarmSettings } from '../settings/alarmSettings';
import type { RentalSession } from '../types/models';
import { estimatedEndTime } from '../utils/billing';
import { navigationRef } from '../navigation/RootNavigator';

export function setupNotificationTapHandler(): void {
  Notifications.addNotificationResponseReceivedListener(() => {
    if (navigationRef.isReady()) {
      navigationRef.resetRoot({ index: 0, routes: [{ name: 'Home' }] });
    }
  });
}

// Notifikasi hanya jadi penanda visual — bunyinya datang dari alarm di aplikasi,
// supaya tidak ada "ting" notifikasi mendahului alarm.
const SILENT_CHANNEL_ID = 'alarm-silent';

let setupDone = false;

export async function setupNotifications(): Promise<void> {
  if (setupDone) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(SILENT_CHANNEL_ID, {
        name: 'Alarm Sewa',
        importance: Notifications.AndroidImportance.MAX,
        sound: null,
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
      // Channel Android tidak bisa diubah suaranya setelah dibuat, jadi channel
      // berbunyi dari versi lama dihapus agar tidak dipakai lagi.
      for (const sound of ALARM_SOUNDS) {
        await Notifications.deleteNotificationChannelAsync(`alarm-${sound.id}`);
      }
    }
    await Notifications.requestPermissionsAsync();
    setupDone = true;
  } catch (e) {
    console.warn('setupNotifications failed (non-fatal):', e);
  }
}

export async function getNotificationPermissionGranted(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

function notificationIdFor(sessionId: number): string {
  return `session-${sessionId}`;
}

export async function scheduleSessionAlarm(
  session: RentalSession,
  unitName: string,
  _settings: AlarmSettings
): Promise<void> {
  try {
    await setupNotifications();
    const identifier = notificationIdFor(session.id);
    await Notifications.cancelScheduledNotificationAsync(identifier);

    if (session.status !== 'active' || session.plannedMinutes == null) return;

    const endTime = estimatedEndTime(session, Date.now());
    if (endTime <= Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `${unitName}, ${session.customerName}`,
        body: 'Waktu sewa sudah berakhir',
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(endTime),
        channelId: SILENT_CHANNEL_ID,
      },
    });
  } catch (e) {
    console.warn('scheduleSessionAlarm failed (non-fatal):', e);
  }
}

export async function scheduleTestAlarm(_settings: AlarmSettings): Promise<void> {
  await setupNotifications();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Tes Alarm',
      body: 'Kalau kamu lihat ini walau app ditutup, notifikasi latar belakang berfungsi.',
      sound: false,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 5,
      channelId: SILENT_CHANNEL_ID,
    },
  });
}

export async function cancelSessionAlarm(sessionId: number): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationIdFor(sessionId));
  } catch (e) {
    console.warn('cancelSessionAlarm failed (non-fatal):', e);
  }
}

export async function rescheduleAlarms(
  sessions: RentalSession[],
  unitNameById: Record<number, string>,
  settings: AlarmSettings
): Promise<void> {
  for (const session of sessions) {
    await scheduleSessionAlarm(session, unitNameById[session.unitId] ?? 'Unit', settings);
  }
}
