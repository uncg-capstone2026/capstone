import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View, type TextInputProps } from 'react-native';

import { TextField } from '@/components/text-field';

type AuthTextInputProps = TextInputProps & {
  error?: string | null;
};

// Always wrapped in the same View so showing an error doesn't remount the input
// (which would drop focus and close the keyboard mid-typing).
export function AuthTextInput({ error, ...props }: AuthTextInputProps) {
  return (
    <View className="gap-1">
      <TextField
        placeholderTextColor="#7a9264"
        className={`h-12 rounded-xl border bg-cream-50 ${error ? 'border-red-500' : 'border-sage-200'}`}
        textClassName="px-4 font-body text-sage-800"
        {...props}
      />
      {error ? <Text className="px-1 font-body text-xs text-red-600">{error}</Text> : null}
    </View>
  );
}

export function AuthDivider({ label = 'or continue with' }: { label?: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-px flex-1 bg-sage-200" />
      <Text className="font-body text-xs uppercase text-sage-400">{label}</Text>
      <View className="h-px flex-1 bg-sage-200" />
    </View>
  );
}

type SocialButtonsProps = {
  label: string;
  onGooglePress: () => void;
};

export function SocialButtons({ label, onGooglePress }: SocialButtonsProps) {
  return (
    <View className="gap-3">
      <Pressable
        onPress={onGooglePress}
        className="flex-row items-center justify-center gap-2 rounded-xl border border-sage-200 bg-cream-50 py-3">
        <Ionicons name="logo-google" size={18} color="#4d5d3f" />
        <Text className="font-label text-base text-sage-700">{label} Google</Text>
      </Pressable>
    </View>
  );
}
