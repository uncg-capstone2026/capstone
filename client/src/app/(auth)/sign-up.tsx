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

import { AuthCheckbox, AuthDivider, AuthTextInput, SocialButtons } from '@/components/auth/auth-ui';
import { PasswordStrength } from '@/components/auth/password-strength';
import { continueWithApple, continueWithGoogle, signUpWithPassword } from '@/services/auth';
import {
  formatPhone,
  isValidEmail,
  isValidPhone,
  meetsPasswordRules,
  toE164,
} from '@/utils/validation';

type Field = 'name' | 'email' | 'phone' | 'password' | 'confirmPassword';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A field's error shows once the user has left it, or after they try to submit.
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const fieldErrors: Record<Field, string | null> = {
    name: name.trim() ? null : 'Enter your name.',
    email: isValidEmail(email) ? null : 'Enter a valid email address.',
    phone: isValidPhone(phone) ? null : 'Enter a 10-digit US phone number.',
    password: meetsPasswordRules(password) ? null : "Password doesn't meet the requirements.",
    confirmPassword: confirmPassword && confirmPassword === password ? null : "Passwords don't match.",
  };

  function visibleError(field: Field) {
    // Confirm password is checked live once it has text, since a mismatch is obvious mid-typing.
    const shown = submitted || touched[field] || (field === 'confirmPassword' && confirmPassword);
    return shown ? fieldErrors[field] : null;
  }

  function markTouched(field: Field) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  async function handleSubmit() {
    setError(null);
    setSubmitted(true);
    if (Object.values(fieldErrors).some(Boolean)) return;

    setIsSubmitting(true);
    try {
      await signUpWithPassword({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: toE164(phone),
        password,
        marketingOptIn,
      });
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
                onBlur={() => markTouched('name')}
                error={visibleError('name')}
                placeholder="Full name"
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
              />
              <AuthTextInput
                value={email}
                onChangeText={setEmail}
                onBlur={() => markTouched('email')}
                error={visibleError('email')}
                placeholder="Email"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
              />
              <AuthTextInput
                value={phone}
                onChangeText={(text) => setPhone(formatPhone(text))}
                onBlur={() => markTouched('phone')}
                error={visibleError('phone')}
                placeholder="Phone number (optional)"
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
              />
              <AuthTextInput
                value={password}
                onChangeText={setPassword}
                onBlur={() => markTouched('password')}
                error={visibleError('password')}
                placeholder="Password"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                passwordRules="minlength: 8; required: lower; required: upper; required: digit;"
              />
              <PasswordStrength password={password} name={name} email={email} />
              <AuthTextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onBlur={() => markTouched('confirmPassword')}
                error={visibleError('confirmPassword')}
                placeholder="Confirm password"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <AuthCheckbox
                checked={marketingOptIn}
                onChange={setMarketingOptIn}
                label="Send me styling picks and event alerts by email or text. You can turn these off any time."
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
