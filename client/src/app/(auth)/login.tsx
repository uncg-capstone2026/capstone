import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthDivider, AuthTextInput, SocialButtons } from '@/components/auth/auth-ui';
import { continueWithApple, continueWithGoogle, loginWithPassword, type LoginMode } from '@/services/auth';

const CLOTHESLINE_SIDE_PADDING = 16; // 8px each side, matches the row's px-2
const CLOTHESLINE_GAP = 8;
const DRESS_SIZE_RATIO = 1.3; // dress renders this much bigger than the other three

// dress.png has a much wider transparent margin around its silhouette than the other
// three PNGs (~28% of its square canvas per side vs. ~9% for jacket/shirt/sweatshirt),
// so at the same box size it visually sits much farther from its neighbors. Pull it in
// with a negative margin to compensate, so the *visible* gaps read as even.
const DRESS_EXTRA_SIDE_MARGIN_FRAC = 0.186;

const GARMENT_FILES = [
  require('@/assets/images/dress.png'),
  require('@/assets/images/jacket.png'),
  require('@/assets/images/shirt.png'),
  require('@/assets/images/sweatshirt.png'),
];

export default function LoginScreen() {
  const { width: windowWidth } = useWindowDimensions();

  // Solve for a garment size that fills the available width (minus gaps) at whatever
  // screen width this device has, so bigger garments never overflow a narrow phone.
  const availableWidth = windowWidth - CLOTHESLINE_SIDE_PADDING - CLOTHESLINE_GAP * 3;
  const garmentSize = Math.max(56, Math.min(112, availableWidth / (3 + DRESS_SIZE_RATIO)));
  const dressSize = garmentSize * DRESS_SIZE_RATIO;
  // The hook loop (not the bar) sits at ~11% down each square garment image, consistently.
  const hangerLoopOffset = Math.round(garmentSize * 0.11);

  const garments = [
    {
      source: GARMENT_FILES[0],
      size: dressSize,
      marginHorizontal: -dressSize * DRESS_EXTRA_SIDE_MARGIN_FRAC,
      marginTop: -3,
    },
    { source: GARMENT_FILES[1], size: garmentSize, marginHorizontal: 0, marginTop: 0 },
    { source: GARMENT_FILES[2], size: garmentSize, marginHorizontal: 0, marginTop: -3 },
    { source: GARMENT_FILES[3], size: garmentSize, marginHorizontal: 0, marginTop: 0 },
  ];

  const [mode, setMode] = useState<LoginMode>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await loginWithPassword({ mode, identifier: mode === 'email' ? email : phone, password });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSocialLogin(provider: 'apple' | 'google') {
    setError(null);
    try {
      await (provider === 'apple' ? continueWithApple() : continueWithGoogle());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-cream-100">
      <View className="items-center pt-6 pb-2">
        <View
          className="relative flex-row items-start px-2"
          style={{ gap: CLOTHESLINE_GAP }}>
          <View
            className="absolute h-[2px] rounded-full bg-sage-700"
            style={{ top: hangerLoopOffset, left: -8, right: -8 }}
          />
          <View
            className="absolute h-1.5 w-1.5 rounded-full bg-sage-700"
            style={{ top: hangerLoopOffset - 2, left: -10 }}
          />
          <View
            className="absolute h-1.5 w-1.5 rounded-full bg-sage-700"
            style={{ top: hangerLoopOffset - 2, right: -10 }}
          />
          {garments.map(({ source, size, marginHorizontal, marginTop }, index) => (
            <Image
              key={index}
              source={source}
              resizeMode="contain"
              style={{ width: size, height: size, marginHorizontal, marginTop }}
            />
          ))}
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView
          contentContainerClassName="flex-grow items-center justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled">
          <View className="w-full max-w-sm gap-8">
            <View className="items-center gap-2">
              <Text className="font-heading text-4xl tracking-wide text-sage-700">StyleMe</Text>
              <Text className="text-center font-body text-base text-sage-500">
                Dressed by someone who knows you.
              </Text>
            </View>

            <View className="flex-row rounded-full border border-sage-200 bg-cream-50 p-1">
              <Pressable
                onPress={() => setMode('email')}
                className={`flex-1 items-center rounded-full py-2 ${mode === 'email' ? 'bg-sage-400' : ''}`}>
                <Text className={mode === 'email' ? 'font-label text-cream-50' : 'font-body text-sage-600'}>
                  Email
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setMode('phone')}
                className={`flex-1 items-center rounded-full py-2 ${mode === 'phone' ? 'bg-sage-400' : ''}`}>
                <Text className={mode === 'phone' ? 'font-label text-cream-50' : 'font-body text-sage-600'}>
                  Phone
                </Text>
              </Pressable>
            </View>

            <View className="gap-3">
              {mode === 'email' ? (
                <AuthTextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              ) : (
                <AuthTextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  keyboardType="phone-pad"
                />
              )}
              <AuthTextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry
              />

              {error ? <Text className="font-body text-sm text-red-600">{error}</Text> : null}

              <Pressable
                onPress={handleSubmit}
                disabled={isSubmitting}
                className="mt-1 flex-row items-center justify-center rounded-xl bg-sage-500 py-3 disabled:opacity-60">
                {isSubmitting ? (
                  <ActivityIndicator color="#fffdf9" />
                ) : (
                  <Text className="font-label text-base text-cream-50">Log In</Text>
                )}
              </Pressable>
            </View>

            <AuthDivider />

            <SocialButtons
              label="Continue with"
              onApplePress={() => handleSocialLogin('apple')}
              onGooglePress={() => handleSocialLogin('google')}
            />

            <View className="flex-row items-center justify-center gap-1">
              <Text className="font-body text-sage-600">New to StyleMe?</Text>
              <Link href="/sign-up" className="font-label text-sage-700 underline">
                Create an account
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
