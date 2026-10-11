import { useEffect, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import Slider from '@react-native-community/slider';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ALARM_SOUNDS } from '../audio/alarmSounds';
import { previewAlarm } from '../audio/alarmManager';
import { getAlarmSettings, setAlarmSettings, DEFAULT_ALARM_SETTINGS } from '../settings/alarmSettings';
import type { AlarmSettings, AlarmSoundId } from '../settings/alarmSettings';
import {
  getNotificationPermissionGranted,
  rescheduleAlarms,
  scheduleTestAlarm,
  setupNotifications,
} from '../notifications/notifications';
import { listActiveSessions } from '../db/sessions.repo';
import { listUnits } from '../db/units.repo';
import { useAlarms } from '../context/AlarmContext';
import { colors } from '../theme/colors';
import AppPressable from '../components/AppPressable';
import ScreenState from '../components/ScreenState';

export default function AlarmSettingsScreen() {
  const [settings, setSettings] = useState<AlarmSettings>(DEFAULT_ALARM_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { reloadSettings } = useAlarms();

  useEffect(() => {
    Promise.all([getAlarmSettings(), getNotificationPermissionGranted()])
      .then(([savedSettings, permission]) => {
        setSettings(savedSettings);
        setPermissionGranted(permission);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  async function persist(next: AlarmSettings) {
    setSettings(next);
    setSaving(true);
    try {
      await setAlarmSettings(next);
      reloadSettings();

      const [sessions, units] = await Promise.all([listActiveSessions(), listUnits()]);
      const unitNameById = Object.fromEntries(units.map((u) => [u.id, u.name]));
      await rescheduleAlarms(sessions, unitNameById, next);
    } catch (e) {
      Alert.alert('Pengaturan tidak tersimpan', String((e as Error).message ?? e));
    } finally {
      setSaving(false);
    }
  }

  function selectSound(soundId: AlarmSoundId) {
    if (soundId === 'custom' && !settings.customSoundUri) {
      handlePickSound();
      return;
    }
    const next = { ...settings, soundId };
    previewAlarm(next);
    persist(next);
  }

  async function handlePickSound() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
    if (result.canceled || !result.assets[0]) return;
    const picked = result.assets[0];
    try {
      const dest = new File(Paths.document, `alarm-custom-${Date.now()}`);
      await new File(picked.uri).copy(dest);
      const next: AlarmSettings = {
        ...settings,
        soundId: 'custom',
        customSoundUri: dest.uri,
        customSoundName: picked.name,
      };
      previewAlarm(next);
      await persist(next);
    } catch (e) {
      Alert.alert('Gagal memuat nada', String(e));
    }
  }

  async function handleRequestPermission() {
    await setupNotifications();
    setPermissionGranted(await getNotificationPermissionGranted());
  }

  async function handleTestAlarm() {
    await scheduleTestAlarm(settings);
    Alert.alert('Tes terjadwal', 'Tutup atau minimalkan aplikasi. Notifikasi akan muncul dalam 5 detik.');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ScreenState title="Memuat pengaturan alarm" />
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <ScreenState
          title="Pengaturan alarm tidak dapat dimuat"
          message="Tutup layar ini, lalu buka kembali dari beranda."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        {permissionGranted === false && (
          <AppPressable style={styles.permissionWarning} onPress={handleRequestPermission}>
            <Text style={styles.permissionWarningTitle}>Notifikasi belum aktif</Text>
            <Text style={styles.permissionWarningText}>Aktifkan izin agar alarm tetap terdengar saat aplikasi ditutup.</Text>
          </AppPressable>
        )}

        <Text style={styles.heading}>Nada alarm</Text>
        {ALARM_SOUNDS.map((sound) => (
          <AppPressable
            key={sound.id}
            style={[styles.soundRow, settings.soundId === sound.id && styles.soundRowActive]}
            onPress={() => selectSound(sound.id)}
            disabled={saving}
            accessibilityRole="radio"
            accessibilityState={{ checked: settings.soundId === sound.id }}
          >
            <Text style={[styles.soundLabel, settings.soundId === sound.id && styles.soundLabelActive]}>
              {sound.label}
            </Text>
            {settings.soundId === sound.id && <Text style={styles.checkmark}>✓</Text>}
          </AppPressable>
        ))}

        <AppPressable
          style={[styles.soundRow, settings.soundId === 'custom' && styles.soundRowActive]}
          onPress={() => selectSound('custom')}
          disabled={saving}
          accessibilityRole="radio"
          accessibilityState={{ checked: settings.soundId === 'custom' }}
        >
          <Text style={[styles.soundLabel, settings.soundId === 'custom' && styles.soundLabelActive]}>
            {settings.customSoundName ?? 'Pilih dari HP...'}
          </Text>
          {settings.soundId === 'custom' && <Text style={styles.checkmark}>✓</Text>}
        </AppPressable>
        {settings.customSoundUri && (
          <AppPressable style={styles.changeButton} onPress={handlePickSound} disabled={saving}>
            <Text style={styles.changeCustom}>Ganti file nada custom</Text>
          </AppPressable>
        )}

        <Text style={[styles.heading, styles.volumeLabel]}>Volume {Math.round(settings.volume * 100)}%</Text>
        <Slider
          minimumValue={0}
          maximumValue={1}
          value={settings.volume}
          onSlidingComplete={(value) => {
            const next = { ...settings, volume: value };
            persist(next);
            previewAlarm(next);
          }}
          minimumTrackTintColor={colors.primary}
          maximumTrackTintColor={colors.border}
          accessibilityLabel="Volume alarm"
        />

        <AppPressable style={styles.testButton} onPress={handleTestAlarm} disabled={saving}>
          <Text style={styles.testButtonText}>Tes Notifikasi Latar Belakang (5 detik)</Text>
        </AppPressable>

        <AppPressable style={styles.testButton} onPress={() => Linking.openSettings()} disabled={saving}>
          <Text style={styles.testButtonText}>Buka Pengaturan Aplikasi</Text>
        </AppPressable>

        <Text style={styles.hint}>
          Selama ada sewa berjalan atau dijeda, notifikasi PhoneRent aktif menjaga alarm tetap dipantau di
          latar belakang. Notifikasi Android dibuat tanpa bunyi supaya tidak mendahului alarm — semua suara
          datang dari nada alarm yang dipilih di atas.
        </Text>
        <Text style={styles.hint}>
          Kalau alarm pernah tidak berbunyi, buka Pengaturan Aplikasi lalu izinkan aplikasi berjalan di latar
          belakang (Baterai: tanpa batasan / jangan optimalkan). Sebagian HP mematikan aplikasi latar belakang
          demi hemat baterai, dan itu ikut mematikan alarm.
        </Text>

        {saving && <Text style={styles.saving} accessibilityLiveRegion="polite">Menyimpan...</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  heading: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 12,
  },
  volumeLabel: {
    marginTop: 24,
  },
  permissionWarning: {
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 14,
    minHeight: 72,
    justifyContent: 'center',
    padding: 16,
    marginBottom: 24,
  },
  permissionWarningTitle: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '800',
  },
  permissionWarningText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3,
  },
  soundRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: 8,
    minHeight: 56,
  },
  soundRowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryBg,
  },
  soundLabel: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  soundLabelActive: {
    color: colors.primary,
  },
  checkmark: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: 16,
  },
  changeCustom: {
    color: colors.primary,
    fontWeight: '600',
  },
  changeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginBottom: 8,
  },
  testButton: {
    marginTop: 20,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  testButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  hint: {
    marginTop: 16,
    fontSize: 14,
    color: colors.textDim,
    lineHeight: 21,
  },
  saving: {
    marginTop: 12,
    color: colors.textDim,
    fontSize: 13,
  },
});
