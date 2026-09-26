import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { isSignedIn } from '@/services/auth';

export default function Index() {
  // null while the stored token is being read.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    isSignedIn().then(setSignedIn);
  }, []);

  if (signedIn === null) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-100">
        <ActivityIndicator color="#7a9264" />
      </View>
    );
  }

  return <Redirect href={signedIn ? '/closet' : '/login'} />;
}
