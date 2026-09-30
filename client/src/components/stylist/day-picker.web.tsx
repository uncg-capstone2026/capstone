import { createElement, useRef } from 'react';

import { DayBox } from '@/components/stylist/day-box';
import { startOfToday, toDateKey } from '@/utils/dates';

type DayPickerProps = {
  value: Date;
  onChange: (date: Date) => void;
};

// @expo/ui's date picker renders nothing on web, so the DAY box opens a hidden browser
// date input's calendar instead.
export function DayPicker({ value, onChange }: DayPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <DayBox value={value} onPress={() => inputRef.current?.showPicker?.()}>
      {createElement('input', {
        ref: inputRef,
        type: 'date',
        tabIndex: -1,
        'aria-hidden': true,
        value: toDateKey(value),
        min: toDateKey(startOfToday()),
        onChange: (e: { target: { value: string } }) => {
          const [year, month, day] = e.target.value.split('-').map(Number);
          if (year && month && day) onChange(new Date(year, month - 1, day));
        },
        // Invisible but still laid out, so the browser can anchor its calendar to the box.
        style: { position: 'absolute', left: 0, bottom: 0, width: '100%', height: 0, opacity: 0, border: 0 },
      })}
    </DayBox>
  );
}
