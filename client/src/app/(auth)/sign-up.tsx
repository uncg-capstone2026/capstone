import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignUpScreen() {
  return (
    <SafeAreaView className="flex-1 bg-cream-100">
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <Text className="font-heading text-2xl text-sage-700">Create your account</Text>
        <Text className="text-center font-body text-base text-sage-500">Coming soon.</Text>
        <Link href="/login" className="mt-4 font-label text-base text-sage-700 underline">
          Back to log in
        </Link>
      </View>
    </SafeAreaView>
  );
}
