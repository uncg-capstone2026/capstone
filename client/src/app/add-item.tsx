import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Placeholder until the add-item upload and tagging flow is built.
export default function AddItemScreen() {
  return (
    <SafeAreaView className="flex-1 bg-cream-100">
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="ml-4 mt-2 h-10 w-10 items-center justify-center">
        <Ionicons name="chevron-back" size={26} color="#4d5d3f" />
      </Pressable>
      <View className="flex-1 items-center justify-center gap-2 px-6">
        <Text className="font-heading text-3xl text-sage-700">Add an item</Text>
        <Text className="text-center font-body text-base text-sage-500">
          Adding items is coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}
