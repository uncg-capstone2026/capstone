import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ConfirmSheetProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  // Throws to keep the sheet open and show the error.
  onConfirm: () => Promise<void>;
};

// Bottom sheet confirming a destructive action, with Cancel and a red confirm button.
export function ConfirmSheet({ visible, title, message, confirmLabel, onCancel, onConfirm }: ConfirmSheetProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Measured out here: inside a Modal the insets can read 0 on the first frame and jump.
  const insets = useSafeAreaInsets();

  function cancel() {
    if (isConfirming) return;
    setError(null);
    onCancel();
  }

  async function confirm() {
    if (isConfirming) return;
    setIsConfirming(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <View className="flex-1">
        <Pressable className="flex-1 bg-sage-900/40" onPress={cancel} accessibilityLabel="Close" />
        <View className="gap-4 rounded-t-3xl bg-cream-50 px-[22px] pt-6" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="gap-1.5">
            <Text accessibilityRole="header" className="font-heading text-xl text-sage-800">
              {title}
            </Text>
            <Text className="font-body text-sm text-sage-600">{message}</Text>
          </View>

          {error ? <Text className="font-body text-sm text-red-700">{error}</Text> : null}

          <View className="flex-row gap-3">
            <Pressable
              onPress={cancel}
              disabled={isConfirming}
              accessibilityRole="button"
              className="flex-1 items-center rounded-full border border-sage-400 py-3.5 disabled:opacity-50">
              <Text className="font-label text-base text-sage-700">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={confirm}
              disabled={isConfirming}
              accessibilityRole="button"
              className="flex-1 items-center rounded-full bg-red-700 py-3.5 disabled:opacity-60">
              {isConfirming ? (
                <ActivityIndicator color="#fffdf9" />
              ) : (
                <Text className="font-label text-base text-cream-50">{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
