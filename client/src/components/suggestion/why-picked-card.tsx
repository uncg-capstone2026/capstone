import { Image } from 'expo-image';
import { Text, View } from 'react-native';

// The stylist's 2-4 short reasons for this outfit: weather, occasion and the user's preferences.
export function WhyPickedCard({ reasons }: { reasons: string[] }) {
  return (
    <View className="gap-3 rounded-2xl bg-cream-50 p-4">
      <View className="flex-row items-center gap-2.5">
        <View className="h-8 w-8 items-center justify-center rounded-full border border-sage-200 bg-[#f3efe4]">
          <Image
            source={require('@/assets/images/styleme-mascot-chat-transparent.png')}
            contentFit="contain"
            accessibilityIgnoresInvertColors
            style={{ width: 22, height: 22, transform: [{ translateY: -1 }] }}
          />
        </View>
        <Text accessibilityRole="header" className="font-label text-xs uppercase tracking-wider text-sage-500">
          Why StyleMe picked this
        </Text>
      </View>
      <View className="gap-2">
        {reasons.map((reason) => (
          <View key={reason} className="flex-row gap-2.5">
            <View className="mt-[7px] h-1.5 w-1.5 rounded-full bg-sage-400" />
            <Text className="flex-1 font-body text-sm text-sage-700">{reason}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
