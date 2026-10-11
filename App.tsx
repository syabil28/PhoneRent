import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { setupNotifications, setupNotificationTapHandler } from './src/notifications/notifications';

export default function App() {
  useEffect(() => {
    setupNotifications();
    setupNotificationTapHandler();
  }, []);

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <RootNavigator />
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
