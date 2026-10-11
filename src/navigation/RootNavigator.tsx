import { DarkTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import CategoryUnitsScreen from '../screens/CategoryUnitsScreen';
import StartRentalScreen from '../screens/StartRentalScreen';
import ExtendSessionScreen from '../screens/ExtendSessionScreen';
import SwapDeviceScreen from '../screens/SwapDeviceScreen';
import HistoryScreen from '../screens/HistoryScreen';
import UnitManagementScreen from '../screens/UnitManagementScreen';
import UnitEditScreen from '../screens/UnitEditScreen';
import AlarmSettingsScreen from '../screens/AlarmSettingsScreen';
import FinanceScreen from '../screens/FinanceScreen';
import { AlarmProvider } from '../context/AlarmContext';
import { colors } from '../theme/colors';
import type { UnitCategory } from '../types/models';

export type RootStackParamList = {
  Home: undefined;
  CategoryUnits: { category: UnitCategory };
  StartRental: { unitId: number };
  ExtendSession: { sessionId: number };
  SwapDevice: { sessionId: number };
  History: undefined;
  UnitManagement: undefined;
  UnitEdit: { unitId: number | null };
  AlarmSettings: undefined;
  Finance: undefined;
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

export default function RootNavigator() {
  return (
    <AlarmProvider>
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        <Stack.Navigator
          screenOptions={{
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: colors.bg },
            headerBackButtonDisplayMode: 'minimal',
            headerShadowVisible: false,
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleAlign: 'left',
            headerTitleStyle: { fontSize: 18, fontWeight: '700' },
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen
            name="CategoryUnits"
            component={CategoryUnitsScreen}
            options={({ route }) => ({ title: route.params.category })}
          />
          <Stack.Screen name="StartRental" component={StartRentalScreen} options={{ title: 'Mulai Sewa' }} />
          <Stack.Screen
            name="ExtendSession"
            component={ExtendSessionScreen}
            options={{ title: 'Tambah Durasi' }}
          />
          <Stack.Screen
            name="SwapDevice"
            component={SwapDeviceScreen}
            options={{ title: 'Ganti Perangkat' }}
          />
          <Stack.Screen name="History" component={HistoryScreen} options={{ title: 'Riwayat' }} />
          <Stack.Screen
            name="UnitManagement"
            component={UnitManagementScreen}
            options={{ title: 'Kelola Perangkat' }}
          />
          <Stack.Screen name="UnitEdit" component={UnitEditScreen} options={{ title: 'Perangkat' }} />
          <Stack.Screen
            name="AlarmSettings"
            component={AlarmSettingsScreen}
            options={{ title: 'Pengaturan Alarm' }}
          />
          <Stack.Screen name="Finance" component={FinanceScreen} options={{ title: 'Keuangan' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </AlarmProvider>
  );
}
