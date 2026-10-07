import { Text, View } from 'react-native';

type WearStatsProps = {
  // Undefined until the server sends wear counts (see PLAN.md).
  timesWorn?: number;
  timesWornThisMonth?: number;
};

export function WearStats({ timesWorn, timesWornThisMonth }: WearStatsProps) {
  return (
    <View className="flex-row gap-3">
      <StatCard value={timesWorn} label="times worn total" />
      <StatCard value={timesWornThisMonth} label="times this month" />
    </View>
  );
}

export function StatCard({ value, label }: { value?: number | string; label: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${value ?? 'Unknown'} ${label}`}
      className="flex-1 items-center gap-0.5 rounded-2xl bg-cream-50 px-3 py-3">
      <Text className="font-heading text-2xl text-sage-700">{value ?? '—'}</Text>
      <Text className="text-center font-body text-xs text-sage-500">{label}</Text>
    </View>
  );
}
