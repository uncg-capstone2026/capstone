import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SessionExpiredError } from '@/services/api';
import {
  addStyleNote,
  deleteStyleNote,
  listStyleNotes,
  MAX_NOTE_LENGTH,
  type StyleNote,
} from '@/services/style-notes';
import { isToday, toDateKey } from '@/utils/dates';

const ICON_COLOR = '#4d5d3f'; // sage-700
const MUTED_COLOR = '#93aa7d'; // sage-400

// What StyleMe remembers about the user's style (Settings → Style Preferences): notes the user
// adds, and ones StyleMe learns from accepted and rejected outfits. Every outfit request uses them.
export default function StylePreferencesScreen() {
  const [notes, setNotes] = useState<StyleNote[] | null>(null); // null while loading
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // bumped by Retry
  const [draft, setDraft] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listStyleNotes()
      .then((loaded) => {
        if (!cancelled) setNotes(loaded);
      })
      .catch((e) => {
        if (cancelled || e instanceof SessionExpiredError) return;
        setLoadError(e instanceof Error ? e.message : "Couldn't load your style notes.");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const canAdd = draft.trim().length > 0 && !isAdding && notes !== null;

  async function add() {
    if (!canAdd) return;
    setError(null);
    setIsAdding(true);
    try {
      const note = await addStyleNote(draft);
      setNotes((current) => [note, ...(current ?? [])]);
      setDraft('');
    } catch (e) {
      if (e instanceof SessionExpiredError) return;
      setError(e instanceof Error ? e.message : "Couldn't add your note.");
    } finally {
      setIsAdding(false);
    }
  }

  // Removes it straight away, then deletes it. Puts it back and shows the error if that fails.
  async function remove(note: StyleNote) {
    setError(null);
    setNotes((current) => current?.filter((n) => n.id !== note.id) ?? current);
    try {
      await deleteStyleNote(note.id);
    } catch (e) {
      setNotes((current) => (current ? [...current, note].sort(newestFirst) : current));
      if (e instanceof SessionExpiredError) return;
      setError(e instanceof Error ? e.message : "Couldn't delete your note.");
    }
  }

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
          Style preferences
        </Text>
        <View className="h-10 w-10" />
      </View>

      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView contentContainerClassName="gap-6 px-6 pb-10 pt-4" keyboardShouldPersistTaps="handled">
          <View className="gap-2">
            <View className="flex-row items-center gap-3">
              {/* Same mascot circle as MascotMessage. */}
              <View className="h-11 w-11 items-center justify-center rounded-full border border-sage-200 bg-[#f3efe4]">
                <Image
                  source={require('@/assets/images/styleme-mascot-chat-transparent.png')}
                  contentFit="contain"
                  accessibilityIgnoresInvertColors
                  style={{ width: 30, height: 30, transform: [{ translateY: -3 }] }}
                />
              </View>
              <Text className="flex-1 font-heading text-2xl text-sage-800">What StyleMe remembers</Text>
            </View>
            <Text className="font-body text-sm text-sage-600">
              StyleMe builds every suggestion from these notes. Add your own, or let StyleMe learn from outfits you
              accept and reject.
            </Text>
          </View>

          <View className="gap-3">
            <View className="flex-row items-center justify-between">
              <Text className="font-label text-xs uppercase tracking-wider text-sage-500">Memory</Text>
              {notes ? (
                <Text className="font-body text-xs text-sage-500">
                  {notes.length === 1 ? '1 note' : `${notes.length} notes`}
                </Text>
              ) : null}
            </View>

            <View className="gap-1">
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={draft}
                  onChangeText={(text) => {
                    setDraft(text);
                    setError(null);
                  }}
                  onSubmitEditing={add}
                  submitBehavior="submit" // Return adds the note and keeps the keyboard open
                  returnKeyType="done"
                  placeholder="Tell StyleMe something"
                  placeholderTextColor={MUTED_COLOR}
                  maxLength={MAX_NOTE_LENGTH}
                  accessibilityLabel="New style note"
                  className="flex-1 rounded-xl border border-sage-200 bg-cream-50 px-4 py-3 font-body text-base text-sage-800"
                />
                <Pressable
                  onPress={add}
                  disabled={!canAdd}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canAdd }}
                  className="h-12 min-w-[64px] items-center justify-center rounded-full bg-sage-500 px-4 disabled:opacity-50">
                  {isAdding ? (
                    <ActivityIndicator color="#fffdf9" />
                  ) : (
                    <Text className="font-label text-base text-cream-50">Add</Text>
                  )}
                </Pressable>
              </View>
              {error ? (
                <Text accessibilityLiveRegion="polite" className="px-1 font-body text-xs text-red-600">
                  {error}
                </Text>
              ) : null}
            </View>

            {notes === null ? (
              loadError ? (
                <View className="items-center gap-3 py-6">
                  <Text className="text-center font-body text-sm text-sage-700">{loadError}</Text>
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
                <ActivityIndicator color={ICON_COLOR} className="py-6" />
              )
            ) : notes.length === 0 ? (
              <Text className="py-4 text-center font-body text-sm text-sage-500">
                No notes yet. Add one above, or StyleMe will learn from the outfits you accept and reject.
              </Text>
            ) : (
              <View className="gap-3">
                {notes.map((note) => (
                  <NoteCard key={note.id} note={note} onDelete={() => remove(note)} />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function NoteCard({ note, onDelete }: { note: StyleNote; onDelete: () => void }) {
  const isLearned = note.source === 'learned';
  return (
    <View className="flex-row items-start gap-3 rounded-2xl bg-cream-50 p-4">
      <View className="flex-1 gap-2">
        <Text className="font-body text-base text-sage-800">{note.text}</Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <View className={`rounded-full px-2.5 py-1 ${isLearned ? 'bg-cream-300' : 'bg-sage-100'}`}>
            <Text className="font-label text-[11px] text-sage-700">
              {isLearned ? 'Learned by StyleMe' : 'Added by you'}
            </Text>
          </View>
          <Text className="font-body text-xs text-sage-500">{formatAddedAt(note.createdAt)}</Text>
        </View>
      </View>
      <Pressable
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`Delete note: ${note.text}`}
        hitSlop={8}
        className="h-7 w-7 items-center justify-center rounded-full active:bg-sage-100">
        <Ionicons name="close" size={18} color={MUTED_COLOR} />
      </Pressable>
    </View>
  );
}

function newestFirst(a: StyleNote, b: StyleNote): number {
  return b.createdAt.localeCompare(a.createdAt);
}

// "Today, 3:42 PM", "Yesterday", "Oct 9", or "Oct 9, 2025" for another year.
function formatAddedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (isToday(date)) {
    return `Today, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (toDateKey(date) === toDateKey(yesterday)) return 'Yesterday';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
