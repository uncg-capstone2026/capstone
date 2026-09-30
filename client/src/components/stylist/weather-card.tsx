import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { useTemperatureUnit } from '@/hooks/use-temperature-unit';
import { useWeather } from '@/hooks/use-weather';
import { temperaturesIn } from '@/services/weather';
import { isToday, toDateKey } from '@/utils/dates';

// A small weather summary for the chosen day. Hidden entirely if location permission was
// denied, the day is past the forecast range, or there's no backend configured.
export function WeatherCard({ date }: { date: Date }) {
  const { weather, loading, error, permissionDenied } = useWeather(date);
  const { unit } = useTemperatureUnit();
  const today = isToday(date);

  if (permissionDenied) return null;
  if (!loading && !error && !weather) return null;

  if (loading) {
    return (
      <Card>
        <ActivityIndicator color="#7a9264" />
        <Text className="font-body text-sm text-sage-500">Checking the weather…</Text>
      </Card>
    );
  }

  // Until the server supports ?date=, it answers every request with today's weather.
  // Don't pass that off as another day's forecast.
  if (error || !weather || (!today && weather.date !== toDateKey(date))) {
    return (
      <Card>
        <Text className="flex-1 font-body text-sm text-sage-500">
          {error ?? "Forecast for this day isn't available yet."}
        </Text>
      </Card>
    );
  }

  const temps = temperaturesIn(weather, unit);
  const degrees = (value: number) => `${Math.round(value)}°`;

  return (
    <Card>
      <Image
        source={{ uri: weather.iconUrl }}
        contentFit="contain"
        accessibilityIgnoresInvertColors
        style={{ width: 44, height: 44 }}
      />
      <View className="flex-1 gap-0.5">
        <Text className="font-label text-base text-sage-800">
          {today ? `${degrees(temps.temp)} · ${weather.condition}` : weather.condition}
        </Text>
        <Text className="font-body text-sm text-sage-600">
          {today ? `Feels like ${degrees(temps.feelsLike)} · ` : ''}H {degrees(temps.high)} / L{' '}
          {degrees(temps.low)} · Rain {weather.chanceOfRain}%
        </Text>
      </View>
    </Card>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-sage-200 bg-cream-50 px-4 py-3">
      {children}
    </View>
  );
}
