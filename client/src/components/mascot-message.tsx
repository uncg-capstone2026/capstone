import { Image } from 'expo-image';
import { Text, View } from 'react-native';

// A chat-style message from the Sage mascot: avatar on the left, speech bubble on the right.
export function MascotMessage({ children }: { children: string }) {
  return (
    <View className="flex-row items-end gap-2">
      <View className="h-11 w-11 items-center justify-center rounded-full border border-sage-200 bg-[#f3efe4]">
        <Image
          source={require('@/assets/images/sage-mascot-chat-transparent.png')}
          contentFit="contain"
          accessibilityIgnoresInvertColors
          style={{ width: 30, height: 30, transform: [{ translateY: -1 }] }}
        />
      </View>
      <View className="flex-1 rounded-2xl rounded-bl-sm border border-sage-200 bg-cream-50 px-3.5 py-2.5">
        <Text className="font-body text-sm text-sage-700">{children}</Text>
      </View>
    </View>
  );
}
