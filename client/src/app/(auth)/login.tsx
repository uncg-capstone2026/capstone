import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { loginWithApple, loginWithGoogle, loginWithPassword, type LoginMode } from '@/services/auth';

export default function LoginScreen() {
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
      await (provider === 'apple' ? loginWithApple() : loginWithGoogle());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-cream-100">
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
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Email"
                  placeholderTextColor="#7a9264"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  className="rounded-xl border border-sage-200 bg-cream-50 px-4 py-3 font-body text-sage-800"
                />
              ) : (
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="Phone number"
                  placeholderTextColor="#7a9264"
                  keyboardType="phone-pad"
                  className="rounded-xl border border-sage-200 bg-cream-50 px-4 py-3 font-body text-sage-800"
                />
              )}
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="#7a9264"
                secureTextEntry
                className="rounded-xl border border-sage-200 bg-cream-50 px-4 py-3 font-body text-sage-800"
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

            <View className="flex-row items-center gap-3">
              <View className="h-px flex-1 bg-sage-200" />
              <Text className="font-body text-xs uppercase text-sage-400">or continue with</Text>
              <View className="h-px flex-1 bg-sage-200" />
            </View>

            <View className="gap-3">
              <Pressable
                onPress={() => handleSocialLogin('apple')}
                className="flex-row items-center justify-center gap-2 rounded-xl bg-black py-3">
                <Ionicons name="logo-apple" size={18} color="#fffdf9" />
                <Text className="font-label text-base text-cream-50">Continue with Apple</Text>
              </Pressable>
              <Pressable
                onPress={() => handleSocialLogin('google')}
                className="flex-row items-center justify-center gap-2 rounded-xl border border-sage-200 bg-cream-50 py-3">
                <Ionicons name="logo-google" size={18} color="#4d5d3f" />
                <Text className="font-label text-base text-sage-700">Continue with Google</Text>
              </Pressable>
            </View>

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
