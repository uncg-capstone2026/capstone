import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Option<T extends string> = { value: T; label: string };

type SelectFieldProps<T extends string> = {
  label: string;
  value: T | null;
  options: Option<T>[];
  onChange: (value: T | null) => void;
  placeholder?: string;
  // Shows an "Add a custom …" row that lets the user type their own value.
  allowCustom?: { label: string; maxLength: number };
  // A short note with a sparkle under the label, e.g. to mark a value the AI stylist uses.
  aiHint?: string;
};

// A labelled field that opens a bottom sheet of options. Includes a "None" row to clear it.
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Not set',
  allowCustom,
  aiHint,
}: SelectFieldProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [custom, setCustom] = useState<string | null>(null); // null = not typing a custom value
  // Measured out here: inside a Modal the insets can read 0 on the first frame and jump.
  const insets = useSafeAreaInsets();

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  function close() {
    setIsOpen(false);
    setCustom(null);
  }

  function choose(next: T | null) {
    close();
    if (next !== value) onChange(next);
  }

  function saveCustom() {
    const trimmed = custom?.trim();
    if (trimmed) choose(trimmed as T);
  }

  return (
    <>
      <View className="flex-row items-center justify-between gap-4">
        <View className="shrink gap-0.5">
          <Text className="font-label text-base text-sage-700">{label}</Text>
          {aiHint ? <AiHint text={aiHint} /> : null}
        </View>
        <Pressable
          onPress={() => setIsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${selectedLabel ?? placeholder}`}
          accessibilityHint={aiHint}
          className="max-w-[65%] flex-row items-center gap-1.5 rounded-xl border border-sage-200 bg-cream-50 px-4 py-2">
          <Text numberOfLines={1} className={`shrink font-body text-base ${value ? 'text-sage-800' : 'text-sage-400'}`}>
            {selectedLabel ?? placeholder}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#61754e" />
        </Pressable>
      </View>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={close}>
        <Pressable className="flex-1 bg-sage-900/30" onPress={close} accessibilityLabel={`Close ${label}`} />
        <View className="max-h-[70%] rounded-t-3xl bg-cream-50 pt-2" style={{ paddingBottom: insets.bottom + 8 }}>
          <View className="flex-row items-center justify-between px-6 py-2">
            <Text className="font-heading text-lg text-sage-700">{label}</Text>
            <Pressable onPress={close} accessibilityRole="button" className="px-2 py-2">
              <Text className="font-label text-base text-sage-600">Done</Text>
            </Pressable>
          </View>
          {aiHint ? (
            <View className="px-6 pb-2">
              <AiHint text={aiHint} />
            </View>
          ) : null}

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="px-4 pb-2">
            {custom !== null && allowCustom ? (
              <View className="flex-row gap-2 px-2 py-2">
                <TextInput
                  value={custom}
                  onChangeText={setCustom}
                  maxLength={allowCustom.maxLength}
                  placeholder="Type it here"
                  placeholderTextColor="#7a9264"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={saveCustom}
                  className="flex-1 rounded-xl border border-sage-200 bg-cream-100 px-4 py-3 font-body text-sage-800"
                />
                <Pressable
                  onPress={saveCustom}
                  disabled={!custom.trim()}
                  accessibilityRole="button"
                  className="items-center justify-center rounded-xl bg-sage-500 px-5 disabled:opacity-60">
                  <Text className="font-label text-base text-cream-50">Save</Text>
                </Pressable>
              </View>
            ) : null}

            <OptionRow label="None" selected={value === null} onPress={() => choose(null)} />
            {options.map((option) => (
              <OptionRow
                key={option.value}
                label={option.label}
                selected={option.value === value}
                onPress={() => choose(option.value)}
              />
            ))}
            {/* A custom value that isn't in the list still shows as selected. */}
            {value && !options.some((o) => o.value === value) ? (
              <OptionRow label={value} selected onPress={close} />
            ) : null}
            {allowCustom && custom === null ? (
              <Pressable
                onPress={() => setCustom('')}
                accessibilityRole="button"
                className="flex-row items-center gap-2 rounded-xl px-4 py-3">
                <Ionicons name="add" size={18} color="#61754e" />
                <Text className="font-label text-base text-sage-600">{allowCustom.label}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`flex-row items-center justify-between rounded-xl px-4 py-3 ${selected ? 'bg-sage-100' : ''}`}>
      <Text className={`font-body text-base ${selected ? 'text-sage-800' : 'text-sage-700'}`}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={18} color="#61754e" /> : null}
    </Pressable>
  );
}

function AiHint({ text }: { text: string }) {
  return (
    <View className="flex-row items-center gap-1">
      <Ionicons name="sparkles" size={12} color="#7a9264" />
      <Text className="font-body text-xs text-sage-500">{text}</Text>
    </View>
  );
}
