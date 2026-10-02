import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayBox } from '@/components/stylist/day-box';
import { startOfToday } from '@/utils/dates';

const ACCENT_COLOR = '#61754e'; // sage-600

// SwiftUI's inline calendar only reports its height after it appears. Reserving the space up
// front stops the iOS sheet opening nearly empty and then jumping.
const IOS_CALENDAR_HEIGHT = 370;

type DayPickerProps = {
  value: Date;
  onChange: (date: Date) => void;
};

// The DAY box. Tapping it opens the phone's own calendar, from today onward. (Any upcoming day
// can be planned; the weather card just hides past the forecast range.)
// Android shows its dialog; iOS shows the inline calendar in a bottom sheet. (Web: day-picker.web.tsx.)
export function DayPicker({ value, onChange }: DayPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Set when the calendar opens, not on every render, so SwiftUI isn't handed a "new" range
  // (and redraws) each time a day is tapped.
  const [minimumDate, setMinimumDate] = useState(startOfToday);
  // Measured out here: inside a Modal the insets can read 0 on the first frame and jump.
  const insets = useSafeAreaInsets();

  function open() {
    setMinimumDate(startOfToday());
    setIsOpen(true);
  }

  function select(date: Date) {
    const day = new Date(date);
    day.setHours(0, 0, 0, 0);
    onChange(day);
  }

  return (
    <>
      <DayBox value={value} onPress={open} />

      {Platform.OS === 'android' && isOpen ? (
        <DateTimePicker
          value={value}
          mode="date"
          presentation="dialog"
          minimumDate={minimumDate}
          accentColor={ACCENT_COLOR}
          onValueChange={(_event, date) => {
            setIsOpen(false);
            select(date);
          }}
          onDismiss={() => setIsOpen(false)}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
          <Pressable
            className="flex-1 bg-sage-900/30"
            onPress={() => setIsOpen(false)}
            accessibilityLabel="Close calendar"
          />
          <View className="rounded-t-3xl bg-cream-50 px-4 pt-2" style={{ paddingBottom: insets.bottom + 8 }}>
            <View className="flex-row justify-end">
              <Pressable onPress={() => setIsOpen(false)} accessibilityRole="button" className="px-2 py-2">
                <Text className="font-label text-base text-sage-600">Done</Text>
              </Pressable>
            </View>
            <View style={{ height: IOS_CALENDAR_HEIGHT }}>
              <DateTimePicker
                value={value}
                mode="date"
                display="inline"
                minimumDate={minimumDate}
                accentColor={ACCENT_COLOR}
                themeVariant="light"
                onValueChange={(_event, date) => select(date)}
              />
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}
