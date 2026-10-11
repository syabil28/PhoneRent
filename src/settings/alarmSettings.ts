import AsyncStorage from '@react-native-async-storage/async-storage';

export type AlarmSoundId = 'beep' | 'bell' | 'siren' | 'custom';

export interface AlarmSettings {
  soundId: AlarmSoundId;
  volume: number;
  customSoundUri: string | null;
  customSoundName: string | null;
}

const STORAGE_KEY = 'phonerent.alarmSettings';

export const DEFAULT_ALARM_SETTINGS: AlarmSettings = {
  soundId: 'beep',
  volume: 1,
  customSoundUri: null,
  customSoundName: null,
};

export async function getAlarmSettings(): Promise<AlarmSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ALARM_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      soundId: parsed.soundId ?? DEFAULT_ALARM_SETTINGS.soundId,
      volume: typeof parsed.volume === 'number' ? parsed.volume : DEFAULT_ALARM_SETTINGS.volume,
      customSoundUri: parsed.customSoundUri ?? null,
      customSoundName: parsed.customSoundName ?? null,
    };
  } catch {
    return DEFAULT_ALARM_SETTINGS;
  }
}

export async function setAlarmSettings(settings: AlarmSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
