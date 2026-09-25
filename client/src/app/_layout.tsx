import { BricolageGrotesque_400Regular, BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque';
import { LibreBaskerville_700Bold } from '@expo-google-fonts/libre-baskerville';
import { Stack } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import '@/global.css';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    LibreBaskerville_700Bold,
    BricolageGrotesque_400Regular,
    BricolageGrotesque_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
