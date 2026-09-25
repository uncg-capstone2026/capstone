import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

type AuthTextInputProps = TextInputProps & {
  error?: string | null;
};

// Always wrapped in the same View so showing an error doesn't remount the input
// (which would drop focus and close the keyboard mid-typing).
export function AuthTextInput({ error, ...props }: AuthTextInputProps) {
  return (
    <View className="gap-1">
      <TextInput
        placeholderTextColor="#7a9264"
        className={`rounded-xl border bg-cream-50 px-4 py-3 font-body text-sage-800 ${
          error ? 'border-red-500' : 'border-sage-200'
        }`}
        {...props}
      />
      {error ? <Text className="px-1 font-body text-xs text-red-600">{error}</Text> : null}
    </View>
  );
}

type AuthCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
};

export function AuthCheckbox({ checked, onChange, label }: AuthCheckboxProps) {
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="flex-row items-start gap-3 py-1">
      <View
        className={`mt-0.5 h-5 w-5 items-center justify-center rounded-md border ${
          checked ? 'border-sage-500 bg-sage-500' : 'border-sage-300 bg-cream-50'
        }`}>
        {checked ? <Ionicons name="checkmark" size={14} color="#fffdf9" /> : null}
      </View>
      <Text className="flex-1 font-body text-sm text-sage-700">{label}</Text>
    </Pressable>
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
  onApplePress: () => void;
  onGooglePress: () => void;
};

export function SocialButtons({ label, onApplePress, onGooglePress }: SocialButtonsProps) {
  return (
    <View className="gap-3">
      <Pressable
        onPress={onApplePress}
        className="flex-row items-center justify-center gap-2 rounded-xl bg-black py-3">
        <Ionicons name="logo-apple" size={18} color="#fffdf9" />
        <Text className="font-label text-base text-cream-50">{label} Apple</Text>
      </Pressable>
      <Pressable
        onPress={onGooglePress}
        className="flex-row items-center justify-center gap-2 rounded-xl border border-sage-200 bg-cream-50 py-3">
        <Ionicons name="logo-google" size={18} color="#4d5d3f" />
        <Text className="font-label text-base text-sage-700">{label} Google</Text>
      </Pressable>
    </View>
  );
}
