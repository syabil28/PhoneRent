import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listUnits } from '../db/units.repo';
import { formatRupiah } from '../utils/format';
import { colors } from '../theme/colors';
import type { RootStackParamList } from '../navigation/RootNavigator';
import type { Unit } from '../types/models';
import AppPressable from '../components/AppPressable';
import ScreenState from '../components/ScreenState';

type Props = NativeStackScreenProps<RootStackParamList, 'UnitManagement'>;

export default function UnitManagementScreen({ navigation }: Props) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      setUnits(await listUnits());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      <FlatList
        data={loading || loadError ? [] : units}
        keyExtractor={(u) => String(u.id)}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? (
            <ScreenState title="Memuat perangkat" />
          ) : loadError ? (
            <ScreenState title="Perangkat tidak dapat dimuat" actionLabel="Coba lagi" onAction={load} />
          ) : (
            <ScreenState title="Belum ada perangkat" message="Tambahkan perangkat pertama untuk mulai menerima sewa." />
          )
        }
        renderItem={({ item }) => (
          <AppPressable
            style={styles.row}
            onPress={() => navigation.navigate('UnitEdit', { unitId: item.id })}
            accessibilityLabel={`${item.name}, ${item.category}, ${formatRupiah(item.hourlyRate)} per jam, ${item.status === 'active' ? 'sedang digunakan' : 'kosong'}`}
          >
            <View style={styles.rowCopy}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.category} · {formatRupiah(item.hourlyRate)}/jam</Text>
            </View>
            <View style={[styles.statusBadge, item.status === 'active' && styles.statusBadgeActive]}>
              <Text style={[styles.status, item.status === 'active' && styles.statusActive]}>
                {item.status === 'active' ? 'Digunakan' : 'Kosong'}
              </Text>
            </View>
          </AppPressable>
        )}
      />
      <AppPressable style={styles.addButton} onPress={() => navigation.navigate('UnitEdit', { unitId: null })}>
        <Text style={styles.addButtonText}>+ Tambah Perangkat</Text>
      </AppPressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listContent: {
    padding: 16,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 72,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  meta: {
    color: colors.textDim,
    marginTop: 2,
  },
  status: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '700',
  },
  statusBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusBadgeActive: {
    backgroundColor: colors.primaryBg,
    borderColor: colors.primary,
  },
  statusActive: {
    color: colors.primary,
  },
  addButton: {
    marginVertical: 16,
    width: '90%',
    maxWidth: 688,
    alignSelf: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    minHeight: 52,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
