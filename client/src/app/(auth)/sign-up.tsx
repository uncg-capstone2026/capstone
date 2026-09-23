import { Link, router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthDivider, AuthTextInput, SocialButtons } from '@/components/auth/auth-ui';
import { continueWithApple, continueWithGoogle, signUpWithPassword } from '@/services/auth';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);

    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await signUpWithPassword({ name, email, phone: phone || undefined, password });
      router.replace('/body-photo');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSocialSignUp(provider: 'apple' | 'google') {
    setError(null);
    try {
      await (provider === 'apple' ? continueWithApple() : continueWithGoogle());
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
            <View className="items-center gap-1">
              <Text className="font-heading text-lg tracking-wide text-sage-600">StyleMe</Text>
              <Text className="font-heading text-3xl text-sage-700">Create your account</Text>
            </View>

            <View className="gap-3">
              <AuthTextInput
                value={name}
                onChangeText={setName}
                placeholder="Full name"
                autoCapitalize="words"
              />
              <AuthTextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <AuthTextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone number (optional)"
                keyboardType="phone-pad"
              />
              <AuthTextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry
              />
              <AuthTextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Confirm password"
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
                  <Text className="font-label text-base text-cream-50">Create Account</Text>
                )}
              </Pressable>
            </View>

            <AuthDivider />

            <SocialButtons
              label="Sign up with"
              onApplePress={() => handleSocialSignUp('apple')}
              onGooglePress={() => handleSocialSignUp('google')}
            />

            <View className="flex-row items-center justify-center gap-1">
              <Text className="font-body text-sage-600">Already have an account?</Text>
              <Link href="/login" className="font-label text-sage-700 underline">
                Log in
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
