import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DecisionButtons, INK, ResultNote, type DecisionResult } from '@/components/suggestion/decision-result';
import { OutfitStage, OVERLAY_BG, SHEET_OVERLAP } from '@/components/suggestion/outfit-stage';
import { PieceThumbnails } from '@/components/suggestion/piece-thumbnails';
import { PromptSheet } from '@/components/prompt-sheet';
import { SelectedPieceBar } from '@/components/suggestion/selected-piece-bar';
import { StylingLoader } from '@/components/suggestion/styling-loader';
import { WhyPickedCard } from '@/components/suggestion/why-picked-card';
import { useTemperatureUnit } from '@/hooks/use-temperature-unit';
import { useWeather } from '@/hooks/use-weather';
import { SessionExpiredError } from '@/services/api';
import { DEFAULT_STAGE_COLOR, getStageColor, setStageColor as saveStageColor } from '@/services/preferences';
import { acceptOutfit, rejectOutfit, styleOutfit, type OutfitSuggestion } from '@/services/stylist';
import { temperaturesIn } from '@/services/weather';
import { fromDateKey } from '@/utils/dates';

const FEEDBACK_CHIPS = ['Something warmer', 'More casual', 'Dressier', 'Different colours', 'No cropped hems'];

// The outfit StyleMe suggests for the day and occasion picked on the Stylist tab.
export default function SuggestionScreen() {
  const params = useLocalSearchParams<{ date?: string; occasion?: string }>();
  const dateKey = params.date;
  const occasion = params.occasion ?? '';
  const date = fromDateKey(dateKey);
  const insets = useSafeAreaInsets();

  const [suggestion, setSuggestion] = useState<OutfitSuggestion | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [excludeIds, setExcludeIds] = useState<string[]>([]); // suggestions already shown
  const [attempt, setAttempt] = useState(0); // bumped by Retry
  const [selectedId, setSelectedId] = useState<string | null>(null); // null = whole outfit
  const [stageColor, setStageColor] = useState(DEFAULT_STAGE_COLOR);
  const [isColorPopoverOpen, setIsColorPopoverOpen] = useState(false);
  const [sheet, setSheet] = useState<'feedback' | 'occasion' | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [outfitId, setOutfitId] = useState<string | null>(null);
  const [isLoaderDone, setIsLoaderDone] = useState(false); // the loader has played through to 100%

  const { weather } = useWeather(date);
  const { unit } = useTemperatureUnit();

  useEffect(() => {
    let cancelled = false;
    styleOutfit({ date: fromDateKey(dateKey), occasion, excludeSuggestionIds: excludeIds })
      .then((next) => {
        if (!cancelled) setSuggestion(next);
      })
      .catch((e) => {
        if (cancelled || e instanceof SessionExpiredError) return;
        setLoadError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [dateKey, occasion, excludeIds, attempt]);

  useEffect(() => {
    getStageColor().then(setStageColor);
  }, []);

  function changeStageColor(color: string) {
    setStageColor(color);
    saveStageColor(color).catch(() => {
      // Keeps working for this session; it just won't be remembered next launch.
    });
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/stylist');
  }

  function retry() {
    setLoadError(null);
    setIsLoaderDone(false);
    setAttempt((n) => n + 1);
  }

  function tryAnother() {
    if (!suggestion) return;
    setExcludeIds((ids) => [...ids, suggestion.suggestionId]);
    setSuggestion(null);
    setIsLoaderDone(false);
    setSelectedId(null);
    setIsColorPopoverOpen(false);
    setResult(null);
    setOutfitId(null);
  }

  if (!suggestion || !isLoaderDone) {
    return (
      <StylingLoader
        key={`${attempt}-${excludeIds.length}`}
        ready={!!suggestion}
        error={loadError}
        onRetry={retry}
        onBack={goBack}
        onFinish={() => setIsLoaderDone(true)}
      />
    );
  }

  const itemIds = suggestion.items.map((item) => item.id);
  const selectedPiece = suggestion.items.find((item) => item.id === selectedId) ?? null;
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const dayLabel = [
    date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }),
    weather ? `${Math.round(temperaturesIn(weather, unit).high)}°, ${weather.condition.toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  async function accept(eventName: string) {
    if (!suggestion) return;
    const saved = await acceptOutfit({
      suggestionId: suggestion.suggestionId,
      itemIds,
      name: suggestion.name,
      eventName,
      date,
    });
    setOutfitId(saved.outfitId);
    setResult({ kind: 'accepted', eventName });
    setSheet(null);
  }

  async function reject(feedback: string) {
    if (!suggestion) return;
    await rejectOutfit({ suggestionId: suggestion.suggestionId, itemIds, feedback });
    setResult({ kind: 'rejected' });
    setSheet(null);
  }

  function openResult() {
    if (result?.kind === 'accepted' && outfitId) {
      router.push({ pathname: '/outfit/[id]', params: { id: outfitId } });
    } else {
      router.push('/style-preferences');
    }
  }

  return (
    <View className="flex-1 bg-cream-200">
      <ScrollView
        style={{ backgroundColor: stageColor }}
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}>
        <OutfitStage
          items={suggestion.items}
          selectedPiece={selectedPiece}
          topRight={
            <View style={{ backgroundColor: OVERLAY_BG }} className="rounded-full px-3 py-1.5">
              <Text className="font-label text-[11px] uppercase tracking-widest text-sage-500">Suggested</Text>
            </View>
          }
          color={stageColor}
          isColorPopoverOpen={isColorPopoverOpen}
          onToggleColorPopover={() => setIsColorPopoverOpen((open) => !open)}
          onChangeColor={changeStageColor}
          onBack={goBack}
        />

        <View
          className="flex-grow gap-5 rounded-t-3xl bg-cream-200 px-[22px] pt-6"
          style={{ marginTop: -SHEET_OVERLAP, paddingBottom: insets.bottom + 24 }}>
          <View className="gap-1">
            <Text accessibilityRole="header" className="font-heading text-[26px] leading-[34px] text-sage-800">
              {suggestion.name}
            </Text>
            <Text className="font-body text-sm text-sage-500">{dayLabel}</Text>
          </View>

          <PieceThumbnails
            items={suggestion.items}
            selectedId={selectedId}
            stageColor={stageColor}
            onSelect={setSelectedId}
          />

          {selectedPiece ? (
            <SelectedPieceBar
              piece={selectedPiece}
              onViewItem={() => router.push({ pathname: '/item/[id]', params: { id: selectedPiece.id } })}
            />
          ) : null}

          <Pressable
            onPress={() => router.push('/try-on')}
            accessibilityRole="button"
            style={{ backgroundColor: INK }}
            className="items-center rounded-full py-3.5">
            <Text className="font-label text-base text-cream-50">✧ See it on your photo</Text>
          </Pressable>

          <WhyPickedCard reasons={suggestion.reasons} />

          {result ? (
            <ResultNote result={result} dayName={dayName} onPrimary={openResult} onTryAnother={tryAnother} />
          ) : (
            <DecisionButtons onReject={() => setSheet('feedback')} onAccept={() => setSheet('occasion')} />
          )}
        </View>
      </ScrollView>

      <PromptSheet
        visible={sheet === 'feedback'}
        title="What would you rather wear?"
        subtitle="StyleMe saves your answer to Style Preferences and uses it for the next suggestion."
        placeholder="e.g. Something warmer, and no cropped hems"
        confirmLabel="Remember this"
        chips={FEEDBACK_CHIPS}
        onCancel={() => setSheet(null)}
        onSubmit={reject}
      />
      <PromptSheet
        visible={sheet === 'occasion'}
        title="What's the occasion?"
        subtitle={`Name the event and StyleMe saves this outfit to your calendar for ${dayName}.`}
        placeholder="e.g. Dinner with Maya"
        confirmLabel="Save outfit"
        submitOnEnter
        onCancel={() => setSheet(null)}
        onSubmit={accept}
      />
    </View>
  );
}
