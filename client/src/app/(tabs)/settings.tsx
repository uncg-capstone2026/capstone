import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useNotificationsEnabled } from '@/hooks/use-notifications-enabled';
import { useTemperatureUnit } from '@/hooks/use-temperature-unit';
import { getMe, signOut, type PublicUser } from '@/services/auth';
import { hasBodyPhoto } from '@/services/photos';

const ICON_COLOR = '#4d5d3f'; // sage-700
const CHEVRON_COLOR = '#93aa7d'; // sage-400

export default function SettingsScreen() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [hasPhoto, setHasPhoto] = useState<boolean | null>(null); // null until known
  const { unit, setUnit } = useTemperatureUnit();
  const { enabled: notificationsEnabled, setEnabled: setNotificationsEnabled } = useNotificationsEnabled();

  // Reload on focus, so "Set" shows straight after adding a try-on photo.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getMe()
        .then((next) => {
          if (!cancelled) setUser(next);
        })
        .catch(() => {});
      hasBodyPhoto()
        .then((next) => {
          if (!cancelled) setHasPhoto(next);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []),
  );

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } catch {
      // Go to login even if clearing the token failed, so the button never looks stuck.
    }
    router.replace('/login');
  }

  const name = user ? (user.displayName ?? user.name) : '';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-cream-100">
      <ScrollView contentContainerClassName="gap-6 px-6 pb-10 pt-6">
        <Text accessibilityRole="header" className="font-heading text-3xl text-sage-700">
          Settings
        </Text>

        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel={user ? `Profile, ${name}, ${user.email}` : 'Profile'}
          className="flex-row items-center gap-4 rounded-2xl bg-cream-50 p-4 active:opacity-80">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-sage-500">
            {user ? (
              <Text className="font-label text-lg text-cream-50">{initials(name)}</Text>
            ) : (
              <Ionicons name="person" size={24} color="#fffdf9" />
            )}
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="font-label text-lg text-sage-800" numberOfLines={1}>
              {user ? name : 'Your profile'}
            </Text>
            {user ? (
              <Text className="font-body text-sm text-sage-500" numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
          </View>
          <Ionicons name="chevron-forward" size={18} color={CHEVRON_COLOR} />
        </Pressable>

        <Group label="Account">
          <SettingsRow
            icon="body-outline"
            label="Try-On Photo"
            value={hasPhoto === null ? undefined : hasPhoto ? 'Set' : 'Not set'}
            onPress={() => router.push({ pathname: '/body-photo', params: { from: 'settings' } })}
          />
          <SettingsRow
            icon="color-palette-outline"
            label="Style Preferences"
            onPress={() => router.push('/style-preferences')}
            isLast
          />
        </Group>

        <Group label="Preferences">
          <SettingsRow
            icon="notifications-outline"
            label="Notifications"
            right={
              <Switch
                value={notificationsEnabled}
                onValueChange={setNotificationsEnabled}
                trackColor={{ true: '#7a9264' }}
                accessibilityLabel="Notifications"
              />
            }
          />
          <SettingsRow
            icon="thermometer-outline"
            label="Units"
            value={unit === 'F' ? '°F' : '°C'}
            onPress={() => setUnit(unit === 'F' ? 'C' : 'F')}
            accessibilityHint="Switches between Fahrenheit and Celsius"
            isLast
          />
        </Group>

        <Pressable
          onPress={handleSignOut}
          disabled={isSigningOut}
          accessibilityRole="button"
          className="flex-row items-center justify-center rounded-full border-2 border-sage-700 py-3.5 active:opacity-80 disabled:opacity-60">
          {isSigningOut ? (
            <ActivityIndicator color={ICON_COLOR} />
          ) : (
            <Text className="font-label text-base text-sage-700">Log out</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="font-label text-xs uppercase tracking-wider text-sage-500">{label}</Text>
      <View className="overflow-hidden rounded-2xl bg-cream-50">{children}</View>
    </View>
  );
}

type SettingsRowProps = {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  value?: string; // shown on the right, before the chevron
  right?: ReactNode; // replaces the value and chevron, e.g. a Switch
  onPress?: () => void;
  accessibilityHint?: string;
  isLast?: boolean; // no divider under the last row
};

function SettingsRow({ icon, label, value, right, onPress, accessibilityHint, isLast }: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityHint={accessibilityHint}
      className={`flex-row items-center gap-3 px-4 py-3 active:bg-sage-50 ${
        isLast ? '' : 'border-b border-sage-100'
      }`}>
      <View className="h-8 w-8 items-center justify-center rounded-lg bg-sage-100">
        <Ionicons name={icon} size={18} color={ICON_COLOR} />
      </View>
      <Text className="flex-1 font-label text-base text-sage-800">{label}</Text>
      {right ?? (
        <View className="flex-row items-center gap-1">
          {value ? <Text className="font-body text-base text-sage-500">{value}</Text> : null}
          <Ionicons name="chevron-forward" size={18} color={CHEVRON_COLOR} />
        </View>
      )}
    </Pressable>
  );
}

// "Emma Sladden" -> "ES"; one name gives one letter.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}
