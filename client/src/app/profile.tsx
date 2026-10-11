import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  View,
  type TextInputProps,
} from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PasswordStrength } from '@/components/auth/password-strength';
import { TextField } from '@/components/text-field';
import { SessionExpiredError } from '@/services/api';
import {
  changePassword,
  deleteAccount,
  getMe,
  TakenFieldError,
  updateEmail,
  updateProfile,
  type PublicUser,
} from '@/services/auth';
import { formatPhone, isValidEmail, isValidPhone, meetsPasswordRules, phoneDigits, toE164 } from '@/utils/validation';

const ICON_COLOR = '#4d5d3f'; // sage-700
const CHEVRON_COLOR = '#93aa7d'; // sage-400
const PLACEHOLDER_COLOR = '#93aa7d'; // sage-400
// iOS suggests strong passwords that meet these; matches PASSWORD_RULES and the sign-up screen.
const PASSWORD_RULES_FOR_IOS = 'minlength: 8; required: lower; required: upper; required: digit;';

type Field = 'name' | 'email' | 'phone';
type Message = { kind: 'error' | 'success'; text: string };

// Account details, opened from the Settings profile card: name, email and mobile, changing
// the password, and deleting the account. Email, password and delete need server routes
// that don't exist yet (PLAN.md section 9), so for now they explain that they aren't available.
export default function ProfileScreen() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // bumped by Retry

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((next) => {
        if (!cancelled) setUser(next);
      })
      .catch((e) => {
        if (cancelled || e instanceof SessionExpiredError) return;
        setLoadError("Couldn't load your account. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <SafeAreaView className="flex-1 bg-cream-100">
      <View className="flex-row items-center justify-between px-4 pt-1">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-10 w-10 items-center justify-center">
          <Ionicons name="chevron-back" size={26} color={ICON_COLOR} />
        </Pressable>
        <Text accessibilityRole="header" className="font-label text-[11px] uppercase tracking-[0.14em] text-sage-800">
          Account
        </Text>
        <View className="h-10 w-10" />
      </View>

      {user ? (
        <AccountForm user={user} onUserChange={setUser} />
      ) : loadError ? (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text accessibilityLiveRegion="polite" className="text-center font-body text-base text-sage-700">
            {loadError}
          </Text>
          <Pressable
            onPress={() => {
              setLoadError(null);
              setAttempt((n) => n + 1);
            }}
            accessibilityRole="button"
            className="rounded-full bg-sage-500 px-6 py-3">
            <Text className="font-label text-base text-cream-50">Try again</Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={ICON_COLOR} />
        </View>
      )}
    </SafeAreaView>
  );
}

function AccountForm({ user, onUserChange }: { user: PublicUser; onUserChange: (user: PublicUser) => void }) {
  // What's saved on the server; Save is muted until a field differs from it.
  const [saved, setSaved] = useState({ name: user.name, email: user.email, phone: formatPhone(user.phone ?? '') });
  const [name, setName] = useState(saved.name);
  const [email, setEmail] = useState(saved.email);
  const [phone, setPhone] = useState(saved.phone);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saveMessage, setSaveMessage] = useState<Message | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const cleanName = name.replace(/\s+/g, ' ').trim();
  const cleanEmail = email.trim().toLowerCase();
  const isProfileChanged = cleanName !== saved.name || phoneDigits(phone) !== phoneDigits(saved.phone);
  const isEmailChanged = cleanEmail !== saved.email.toLowerCase();
  const isDirty = isProfileChanged || isEmailChanged;

  function edit(field: Field, value: string) {
    if (field === 'name') setName(value);
    if (field === 'email') setEmail(value);
    if (field === 'phone') setPhone(formatPhone(value));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSaveMessage(null);
  }

  async function save() {
    const nextErrors: Partial<Record<Field, string>> = {
      name: cleanName ? undefined : 'Enter your name.',
      email: isValidEmail(email) ? undefined : 'Enter a valid email address.',
      phone: isValidPhone(phone) ? undefined : 'Enter a 10-digit US phone number.',
    };
    setErrors(nextErrors);
    setSaveMessage(null);
    if (Object.values(nextErrors).some(Boolean)) return;

    setIsSaving(true);
    try {
      if (isProfileChanged) {
        try {
          const updated = await updateProfile({
            name: cleanName,
            phone: toE164(phone) ?? null,
            // Settings shows displayName before name, so keep it in step when there is one.
            ...(user.displayName ? { displayName: cleanName } : {}),
          });
          onUserChange(updated);
          setSaved((current) => ({ ...current, name: updated.name, phone: formatPhone(updated.phone ?? '') }));
          setName(updated.name);
          setPhone(formatPhone(updated.phone ?? ''));
        } catch (e) {
          if (e instanceof SessionExpiredError) return;
          if (e instanceof TakenFieldError) setErrors({ phone: e.message });
          else setSaveMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not save your changes.' });
          return;
        }
      }
      // Sent on its own, so name and mobile still save while the server doesn't accept email.
      if (isEmailChanged) {
        try {
          const updated = await updateEmail(cleanEmail);
          onUserChange(updated);
          setSaved((current) => ({ ...current, email: updated.email }));
          setEmail(updated.email);
        } catch (e) {
          if (e instanceof SessionExpiredError) return;
          setErrors({ email: e instanceof Error ? e.message : 'Could not change your email.' });
          if (isProfileChanged) setSaveMessage({ kind: 'success', text: 'Name and mobile saved.' });
          return;
        }
      }
      setSaveMessage({ kind: 'success', text: 'Saved.' });
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('Delete your account?', "This deletes your closet, outfits and photos. It can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void removeAccount() },
    ]);
  }

  async function removeAccount() {
    setIsDeleting(true);
    try {
      await deleteAccount();
      router.replace('/login');
    } catch (e) {
      if (e instanceof SessionExpiredError) return;
      Alert.alert("Couldn't delete your account", e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1">
      <ScrollView contentContainerClassName="gap-6 px-6 pb-10 pt-4" keyboardShouldPersistTaps="handled">
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="h-20 w-20 items-center justify-center self-center rounded-full bg-sage-500">
          {/* Libre Baskerville is taller than text-3xl's line height, which pushed the letter up.
              A taller line lets iOS center it, and 1pt down centers the capital itself. */}
          <Text className="font-heading text-3xl leading-10 text-cream-50" style={{ transform: [{ translateY: 1 }] }}>
            {initial(saved.name)}
          </Text>
        </View>

        <View className="gap-2">
          <Group label="Profile">
            <FieldRow
              label="Name"
              value={name}
              onChangeText={(text) => edit('name', text)}
              error={errors.name}
              textContentType="name"
              autoComplete="name"
              maxLength={50}
            />
            <FieldRow
              label="Email"
              value={email}
              onChangeText={(text) => edit('email', text)}
              error={errors.email}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <FieldRow
              label="Mobile"
              value={phone}
              onChangeText={(text) => edit('phone', text)}
              error={errors.phone}
              placeholder="(336) 555-0123"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              isLast
            />
          </Group>
          {saveMessage ? <InlineMessage message={saveMessage} /> : null}
        </View>

        <Group label="Security">
          <ChangePasswordRow name={saved.name} email={saved.email} />
        </Group>

        <Pressable
          onPress={save}
          disabled={!isDirty || isSaving}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isDirty || isSaving }}
          className="items-center rounded-full bg-sage-500 py-3.5 disabled:opacity-50">
          {isSaving ? (
            <ActivityIndicator color="#fffdf9" />
          ) : (
            <Text className="font-label text-base text-cream-50">Save</Text>
          )}
        </Pressable>

        <Pressable
          onPress={confirmDelete}
          disabled={isDeleting}
          accessibilityRole="button"
          className="items-center py-2 disabled:opacity-50">
          {isDeleting ? (
            <ActivityIndicator color={ICON_COLOR} />
          ) : (
            <Text className="font-label text-base text-sage-700">Delete account</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// "Change password", which opens in place into the form. The new password has the same rules
// as sign-up, shown with the same strength meter (which also checks it against the name and email).
function ChangePasswordRow({ name, email }: { name: string; email: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<Message | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function problem(): string | null {
    if (!current || !next || !confirm) return 'Fill in all three fields.';
    if (!meetsPasswordRules(next)) return "New password doesn't meet the requirements.";
    if (next !== confirm) return "The new passwords don't match.";
    if (next === current) return 'Choose a password different from your current one.';
    return null;
  }

  async function submit() {
    const error = problem();
    if (error) {
      setMessage({ kind: 'error', text: error });
      return;
    }
    setMessage(null);
    setIsSubmitting(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setMessage({ kind: 'success', text: 'Password updated.' });
    } catch (e) {
      if (e instanceof SessionExpiredError) return;
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not change your password.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Animated.View layout={LinearTransition}>
      <Pressable
        onPress={() => setIsOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        className="flex-row items-center px-4 py-3.5 active:bg-sage-50">
        <Text className="flex-1 font-label text-base text-sage-800">Change password</Text>
        <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={18} color={CHEVRON_COLOR} />
      </Pressable>

      {isOpen ? (
        <Animated.View entering={FadeIn} exiting={FadeOut} className="gap-3 border-t border-sage-100 px-4 pb-4 pt-3">
          <PasswordInput
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            textContentType="password"
            autoComplete="current-password"
          />
          <PasswordInput
            label="New password"
            value={next}
            onChangeText={setNext}
            placeholder="At least 8 characters"
            textContentType="newPassword"
            autoComplete="new-password"
            passwordRules={PASSWORD_RULES_FOR_IOS}
          />
          <PasswordStrength password={next} name={name} email={email} />
          <PasswordInput
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repeat it"
            textContentType="newPassword"
            autoComplete="new-password"
            passwordRules={PASSWORD_RULES_FOR_IOS}
          />
          {message ? <InlineMessage message={message} /> : null}
          <Pressable
            onPress={submit}
            disabled={isSubmitting}
            accessibilityRole="button"
            className="items-center rounded-full bg-sage-500 py-3 disabled:opacity-50">
            {isSubmitting ? (
              <ActivityIndicator color="#fffdf9" />
            ) : (
              <Text className="font-label text-base text-cream-50">Update password</Text>
            )}
          </Pressable>
        </Animated.View>
      ) : null}
    </Animated.View>
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

type FieldRowProps = TextInputProps & {
  label: string;
  error?: string;
  isLast?: boolean; // no divider under the last row
};

// A labeled text field inside a Group card, with its error underneath.
function FieldRow({ label, error, isLast, ...props }: FieldRowProps) {
  return (
    <View className={`gap-1 px-4 py-3 ${isLast ? '' : 'border-b border-sage-100'}`}>
      <Text className="font-label text-sm text-sage-500">{label}</Text>
      <TextField
        accessibilityLabel={label}
        placeholderTextColor={PLACEHOLDER_COLOR}
        className="h-6"
        textClassName="font-body text-[16px] text-sage-800"
        {...props}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" className="font-body text-xs text-red-600">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function PasswordInput({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View className="gap-1">
      <Text className="font-label text-sm text-sage-500">{label}</Text>
      <TextField
        accessibilityLabel={label}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={PLACEHOLDER_COLOR}
        className="h-12 rounded-xl border border-sage-200 bg-cream-100"
        textClassName="px-3 font-body text-[16px] text-sage-800"
        {...props}
      />
    </View>
  );
}

function InlineMessage({ message }: { message: Message }) {
  return (
    <Text
      accessibilityLiveRegion="polite"
      className={`px-1 font-body text-sm ${message.kind === 'error' ? 'text-red-600' : 'text-sage-600'}`}>
      {message.text}
    </Text>
  );
}

// "Emma Sladden" -> "E".
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}
