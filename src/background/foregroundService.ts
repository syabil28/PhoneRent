import notifee, { AndroidImportance } from '@notifee/react-native';
import { Platform } from 'react-native';

const CHANNEL_ID = 'phonerent-background';
let running = false;

// Keeps the JS process alive while backgrounded. The task itself does nothing,
// it just holds the foreground-service "lease" so Android doesn't suspend/kill us.
if (Platform.OS === 'android') {
  try {
    notifee.registerForegroundService(() => new Promise(() => {}));
  } catch (e) {
    console.warn('registerForegroundService failed (non-fatal):', e);
  }
}

export async function startForegroundService(activeCount: number): Promise<void> {
  if (Platform.OS !== 'android' || running) return;
  try {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'PhoneRent Aktif',
      importance: AndroidImportance.LOW,
    });
    await notifee.displayNotification({
      title: 'PhoneRent aktif',
      body: `${activeCount} sewa sedang berjalan atau dijeda. Alarm tetap dipantau.`,
      android: {
        channelId: CHANNEL_ID,
        asForegroundService: true,
        ongoing: true,
      },
    });
    running = true;
  } catch (e) {
    console.warn('startForegroundService failed (non-fatal):', e);
  }
}

export async function stopForegroundService(): Promise<void> {
  if (Platform.OS !== 'android' || !running) return;
  try {
    await notifee.stopForegroundService();
    running = false;
  } catch (e) {
    console.warn('stopForegroundService failed (non-fatal):', e);
  }
}
