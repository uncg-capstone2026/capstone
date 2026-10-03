import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_LENGTH = 200;

type PromptSheetProps = {
  visible: boolean;
  title: string;
  subtitle: string;
  placeholder: string;
  confirmLabel: string;
  chips?: string[]; // quick replies; tapping one fills the input
  submitOnEnter?: boolean;
  onCancel: () => void;
  // Throws to keep the sheet open and show the error.
  onSubmit: (text: string) => Promise<void>;
};

// A bottom sheet asking one question, with a text answer and Cancel / confirm buttons.
// The confirm button stays dimmed until there's text.
export function PromptSheet({
  visible,
  title,
  subtitle,
  placeholder,
  confirmLabel,
  chips,
  submitOnEnter,
  onCancel,
  onSubmit,
}: PromptSheetProps) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Measured out here: inside a Modal the insets can read 0 on the first frame and jump.
  const insets = useSafeAreaInsets();

  const canSubmit = text.trim().length > 0 && !isSubmitting;

  function reset() {
    setText('');
    setError(null);
  }

  function cancel() {
    if (isSubmitting) return;
    reset();
    onCancel();
  }

  async function submit() {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(text.trim());
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <Pressable className="flex-1 bg-sage-900/40" onPress={cancel} accessibilityLabel="Close" />
        <View className="gap-4 rounded-t-3xl bg-cream-50 px-[22px] pt-6" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="gap-1.5">
            <Text accessibilityRole="header" className="font-heading text-xl text-sage-800">
              {title}
            </Text>
            <Text className="font-body text-sm text-sage-600">{subtitle}</Text>
          </View>

          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            placeholderTextColor="#7a9264"
            accessibilityLabel={title}
            autoFocus
            maxLength={MAX_LENGTH}
            returnKeyType={submitOnEnter ? 'done' : 'default'}
            onSubmitEditing={submitOnEnter ? submit : undefined}
            className="rounded-xl border border-sage-200 bg-cream-100 px-4 py-3 font-body text-base text-sage-800"
          />

          {chips ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="gap-2">
              {chips.map((chip) => (
                <Pressable
                  key={chip}
                  onPress={() => setText(chip)}
                  accessibilityRole="button"
                  className="rounded-full border border-sage-200 bg-cream-100 px-3.5 py-2">
                  <Text className="font-body text-sm text-sage-700">{chip}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {error ? <Text className="font-body text-sm text-red-700">{error}</Text> : null}

          <View className="flex-row gap-3">
            <Pressable
              onPress={cancel}
              accessibilityRole="button"
              className="flex-1 items-center rounded-full border border-sage-400 py-3.5">
              <Text className="font-label text-base text-sage-700">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              className="flex-1 items-center rounded-full bg-sage-500 py-3.5 disabled:opacity-50">
              {isSubmitting ? (
                <ActivityIndicator color="#fffdf9" />
              ) : (
                <Text className="font-label text-base text-cream-50">{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
