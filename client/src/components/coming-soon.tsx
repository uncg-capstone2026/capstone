import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ComingSoonProps = {
  title: string;
  message?: string;
};

// Placeholder for screens that haven't been built yet.
export function ComingSoon({ title, message = 'Coming soon.' }: ComingSoonProps) {
  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-cream-100">
      <View className="flex-1 items-center justify-center gap-2 px-6">
        <Text className="font-heading text-3xl text-sage-700">{title}</Text>
        <Text className="text-center font-body text-base text-sage-500">{message}</Text>
      </View>
    </SafeAreaView>
  );
}
