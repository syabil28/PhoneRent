import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { resolveAlarmSource } from './alarmSounds';
import type { AlarmSettings } from '../settings/alarmSettings';

let player: AudioPlayer | null = null;
let initialized = false;
let wantPlaying = false;

async function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  await setAudioModeAsync({
    playsInSilentMode: true,
    // Alarm harus tetap bunyi saat aplikasi diminimize atau layar terkunci.
    shouldPlayInBackground: true,
    // Rebut fokus audio supaya tidak tenggelam di balik musik/video yang sedang jalan.
    interruptionMode: 'doNotMix',
  });
}

export async function playAlarm(settings: AlarmSettings): Promise<void> {
  wantPlaying = true;
  try {
    await ensureInitialized();
    const source = resolveAlarmSource(settings);

    if (!player) {
      player = createAudioPlayer(source);
    } else {
      player.replace(source);
    }
    player.loop = true;
    player.volume = Math.max(0, Math.min(1, settings.volume));
    await player.seekTo(0);
    player.play();
    // Tanpa kontrol lock screen, Android menghentikan audio background setelah ~3 menit.
    player.setActiveForLockScreen(true, { title: 'Waktu sewa berakhir', artist: 'PhoneRent' });
  } catch (e) {
    console.warn('playAlarm failed (non-fatal):', e);
  }
}

/**
 * Dipanggil tiap detik selagi ada alarm berbunyi. Kalau sistem sempat menghentikan
 * pemutar (kehilangan fokus audio, error sesaat), alarm dinyalakan lagi.
 */
export async function ensureAlarmPlaying(settings: AlarmSettings): Promise<void> {
  if (!wantPlaying) return;
  try {
    if (!player) {
      await playAlarm(settings);
      return;
    }
    // Dilanjutkan, bukan diputar ulang dari awal, supaya bunyinya tidak tersendat.
    if (!player.playing) player.play();
  } catch (e) {
    console.warn('ensureAlarmPlaying failed (non-fatal):', e);
  }
}

export function stopAlarm(): void {
  wantPlaying = false;
  try {
    player?.pause();
    player?.clearLockScreenControls();
  } catch (e) {
    console.warn('stopAlarm failed (non-fatal):', e);
  }
}

export function previewAlarm(settings: AlarmSettings): void {
  ensureInitialized()
    .then(() => {
      const source = resolveAlarmSource(settings);
      const previewPlayer = createAudioPlayer(source);
      previewPlayer.loop = false;
      previewPlayer.volume = Math.max(0, Math.min(1, settings.volume));
      previewPlayer.play();
      setTimeout(() => previewPlayer.remove(), 3000);
    })
    .catch((e) => console.warn('previewAlarm failed (non-fatal):', e));
}
