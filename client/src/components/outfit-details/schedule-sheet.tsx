import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayPicker } from '@/components/stylist/day-picker';
import { startOfToday, toDateKey } from '@/utils/dates';

const MAX_EVENT_LENGTH = 100;

type ScheduleSheetProps = {
  visible: boolean;
  onCancel: () => void;
  // Throws to keep the sheet open and show the error.
  onSchedule: (entry: { date: string; eventName: string | null }) => Promise<void>;
};

// "Schedule this outfit": a day (today onward) and an optional event name. Each one adds a new
// date, so the same outfit can be planned for several events.
export function ScheduleSheet({ visible, onCancel, onSchedule }: ScheduleSheetProps) {
  const [date, setDate] = useState(startOfToday);
  const [eventName, setEventName] = useState('');
  const [wasVisible, setWasVisible] = useState(visible);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Measured out here: inside a Modal the insets can read 0 on the first frame and jump.
  const insets = useSafeAreaInsets();

  // Start fresh each time the sheet opens.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDate(startOfToday());
      setEventName('');
      setError(null);
    }
  }

  function cancel() {
    if (!isSaving) onCancel();
  }

  async function schedule() {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSchedule({ date: toDateKey(date), eventName: eventName.trim() || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancel}>
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <Pressable className="flex-1 bg-sage-900/40" onPress={cancel} accessibilityLabel="Close" />
        <View className="gap-4 rounded-t-3xl bg-cream-50 px-[22px] pt-6" style={{ paddingBottom: insets.bottom + 12 }}>
          <Text accessibilityRole="header" className="font-heading text-xl text-sage-800">
            Schedule this outfit
          </Text>

          <View className="gap-1.5">
            <Text className="font-label text-sm text-sage-700">Date</Text>
            <DayPicker value={date} onChange={setDate} />
          </View>

          <View className="gap-1.5">
            <Text className="font-label text-sm text-sage-700">Event (optional)</Text>
            <TextInput
              value={eventName}
              onChangeText={setEventName}
              placeholder="e.g. Dinner with friends"
              placeholderTextColor="#7a9264"
              accessibilityLabel="Event name"
              maxLength={MAX_EVENT_LENGTH}
              returnKeyType="done"
              className="rounded-xl border border-sage-200 bg-cream-100 px-4 py-3 font-body text-base text-sage-800"
            />
          </View>

          {error ? <Text className="font-body text-sm text-red-700">{error}</Text> : null}

          <View className="flex-row gap-3">
            <Pressable
              onPress={cancel}
              accessibilityRole="button"
              className="flex-1 items-center rounded-full border border-sage-400 py-3.5">
              <Text className="font-label text-base text-sage-700">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={schedule}
              disabled={isSaving}
              accessibilityRole="button"
              className="flex-1 items-center rounded-full bg-sage-500 py-3.5 disabled:opacity-50">
              {isSaving ? (
                <ActivityIndicator color="#fffdf9" />
              ) : (
                <Text className="font-label text-base text-cream-50">Schedule</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
