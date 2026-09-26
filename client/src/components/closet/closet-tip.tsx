import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

export function ClosetTip() {
  return (
    <View className="flex-row items-start gap-2 rounded-xl border border-sage-200 bg-sage-50 px-4 py-3">
      <Ionicons name="information-circle-outline" size={18} color="#61754e" />
      <Text className="flex-1 font-body text-sm text-sage-700">
        Add at least 5 items so your closet can start suggesting outfits.
      </Text>
    </View>
  );
}
