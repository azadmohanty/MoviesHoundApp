import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import { BottomNavigation } from './src/navigation/BottomNavigation';

export default function App() {
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

  return <BottomNavigation />;
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
