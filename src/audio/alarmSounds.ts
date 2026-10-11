import type { AlarmSettings, AlarmSoundId } from '../settings/alarmSettings';

export interface AlarmSoundOption {
  id: AlarmSoundId;
  label: string;
  file: number;
  fileName: string;
}

export const ALARM_SOUNDS: AlarmSoundOption[] = [
  { id: 'beep', label: 'Beep', file: require('../../assets/sounds/beep.wav'), fileName: 'beep.wav' },
  { id: 'bell', label: 'Bel', file: require('../../assets/sounds/bell.wav'), fileName: 'bell.wav' },
  { id: 'siren', label: 'Sirene', file: require('../../assets/sounds/siren.wav'), fileName: 'siren.wav' },
];

export function getAlarmSound(id: AlarmSoundId): AlarmSoundOption {
  return ALARM_SOUNDS.find((s) => s.id === id) ?? ALARM_SOUNDS[0];
}

/** Resolves the playable source for expo-audio: a bundled asset, or a picked file uri. */
export function resolveAlarmSource(settings: Pick<AlarmSettings, 'soundId' | 'customSoundUri'>): number | { uri: string } {
  if (settings.soundId === 'custom' && settings.customSoundUri) {
    return { uri: settings.customSoundUri };
  }
  return getAlarmSound(settings.soundId).file;
}
