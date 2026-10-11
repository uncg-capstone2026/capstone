import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

export const INK = '#2D362A';

type DecisionButtonsProps = {
  onReject: () => void;
  onAccept: () => void;
};

// "Not for me" and "Looks right", side by side.
export function DecisionButtons({ onReject, onAccept }: DecisionButtonsProps) {
  return (
    <View className="flex-row gap-3">
      <Pressable
        onPress={onReject}
        accessibilityRole="button"
        className="flex-1 items-center rounded-full border border-sage-400 py-3.5">
        <Text className="font-label text-base text-sage-700">Not for me</Text>
      </Pressable>
      <Pressable onPress={onAccept} accessibilityRole="button" className="flex-1 items-center rounded-full bg-sage-500 py-3.5">
        <Text className="font-label text-base text-cream-50">Looks right</Text>
      </Pressable>
    </View>
  );
}

type ResultNoteProps = {
  eventName: string; // what the user called the occasion
  dayName: string; // e.g. "Saturday"
  onOpen: () => void;
  onTryAnother: () => void;
};

// Replaces the decision buttons once the user has accepted the outfit.
export function ResultNote({ eventName, dayName, onOpen, onTryAnother }: ResultNoteProps) {
  return (
    <View className="gap-3">
      <View accessibilityLiveRegion="polite" className="flex-row gap-3 rounded-2xl bg-sage-100 p-4">
        <Ionicons name="checkmark-circle" size={20} color="#61754e" />
        <Text className="flex-1 font-body text-sm text-sage-800">
          {`Saved as “${eventName}” for ${dayName}, and StyleMe noted what worked here.`}
        </Text>
      </View>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        style={{ backgroundColor: INK }}
        className="items-center rounded-full py-3.5">
        <Text className="font-label text-base text-cream-50">Open the outfit</Text>
      </Pressable>
      <Pressable onPress={onTryAnother} accessibilityRole="button" className="items-center py-2">
        <Text className="font-body text-sm text-sage-500 underline">Try another suggestion</Text>
      </Pressable>
    </View>
  );
}
