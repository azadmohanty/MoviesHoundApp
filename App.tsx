import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import AppNavigator from './src/navigation/AppNavigator';
import { initSafeAreaCache } from './src/utils/SafeAreaCache';

export default function App() {
  useEffect(() => {
    initSafeAreaCache();
    // Lock entire app to portrait. VideoPlayerModal unlocks to landscape when fullscreen is active.
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
  }, []);
  const [fontsLoaded] = useFonts({
    'Ndot55': require('./assets/fonts/Ndot55-Regular.otf'),
    'Ndot57': require('./assets/fonts/Ndot57-Regular.otf'),
    'NType82Mono': require('./assets/fonts/NType82Mono-Regular.otf'),
    'LetteraMono': require('./assets/fonts/LetteraMonoLL-Regular.otf'),
  });

  if (!fontsLoaded) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="small" color="#FF0000" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppNavigator />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
