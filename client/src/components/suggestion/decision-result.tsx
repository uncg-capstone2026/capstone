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

export type DecisionResult = { kind: 'accepted'; eventName: string } | { kind: 'rejected' };

type ResultNoteProps = {
  result: DecisionResult;
  dayName: string; // e.g. "Saturday"
  onPrimary: () => void; // open the outfit, or see what was remembered
  onTryAnother: () => void;
};

// Replaces the decision buttons once the user has chosen.
export function ResultNote({ result, dayName, onPrimary, onTryAnother }: ResultNoteProps) {
  const isAccepted = result.kind === 'accepted';
  const message = isAccepted
    ? `Saved as “${result.eventName}” for ${dayName}, and StyleMe noted what worked here.`
    : 'StyleMe noted this in Style Preferences and will steer away from it next time.';

  return (
    <View className="gap-3">
      <View
        accessibilityLiveRegion="polite"
        className={`flex-row gap-3 rounded-2xl p-4 ${isAccepted ? 'bg-sage-100' : 'bg-cream-300/60'}`}>
        <Ionicons name={isAccepted ? 'checkmark-circle' : 'bookmark'} size={20} color="#61754e" />
        <Text className="flex-1 font-body text-sm text-sage-800">{message}</Text>
      </View>
      <Pressable
        onPress={onPrimary}
        accessibilityRole="button"
        style={{ backgroundColor: INK }}
        className="items-center rounded-full py-3.5">
        <Text className="font-label text-base text-cream-50">
          {isAccepted ? 'Open the outfit' : 'See what was remembered'}
        </Text>
      </Pressable>
      <Pressable onPress={onTryAnother} accessibilityRole="button" className="items-center py-2">
        <Text className="font-body text-sm text-sage-500 underline">Try another suggestion</Text>
      </Pressable>
    </View>
  );
}
