import { View } from 'react-native';

type SheetHeaderProps = {
  left: React.ReactNode;
  title: React.ReactNode;
  right?: React.ReactNode;
};

// Top bar of a page sheet: a grabber like iOS's own sheets, then left action, title, right action.
// Padded in from the edges so the actions clear the sheet's rounded corners.
export function SheetHeader({ left, title, right }: SheetHeaderProps) {
  return (
    <View className="border-b border-sage-200 bg-cream-100">
      <View className="mt-2 h-[5px] w-9 self-center rounded-full bg-sage-200" />
      <View className="flex-row items-center justify-between px-6 pb-3.5 pt-3">
        <View className="min-w-[64px] items-start">{left}</View>
        {title}
        <View className="min-w-[64px] items-end">{right}</View>
      </View>
    </View>
  );
}
