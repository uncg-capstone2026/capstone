import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder until the real home screen exists.
export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-cream-100">
      <View className="flex-1 items-center justify-center gap-2 px-6">
        <Text className="font-heading text-3xl text-sage-700">You&apos;re all set</Text>
        <Text className="text-center font-body text-base text-sage-500">Your closet is coming soon.</Text>
      </View>
    </SafeAreaView>
  );
}
