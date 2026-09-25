import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { PASSWORD_RULES, getPasswordStrength } from '@/utils/validation';

// Bar color per strength score (0–4).
const SCORE_COLORS = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-sage-400', 'bg-sage-600'];
const LABEL_COLORS = ['text-red-600', 'text-red-600', 'text-amber-600', 'text-sage-600', 'text-sage-700'];

type PasswordStrengthProps = {
  password: string;
  name?: string;
  email?: string;
};

export function PasswordStrength({ password, name, email }: PasswordStrengthProps) {
  if (!password) return null;

  const { score, label } = getPasswordStrength(password, { name, email });
  const filled = Math.max(score, 1); // always show at least one segment once typing starts

  return (
    <View className="gap-2 px-1" accessibilityLabel={`Password strength: ${label}`}>
      <View className="flex-row items-center gap-2">
        <View className="flex-1 flex-row gap-1">
          {[1, 2, 3, 4].map((segment) => (
            <View
              key={segment}
              className={`h-1.5 flex-1 rounded-full ${segment <= filled ? SCORE_COLORS[score] : 'bg-sage-100'}`}
            />
          ))}
        </View>
        <Text className={`w-16 text-right font-label text-xs ${LABEL_COLORS[score]}`}>{label}</Text>
      </View>

      <View className="gap-1">
        {PASSWORD_RULES.map((rule) => {
          const met = rule.test(password);
          return (
            <View key={rule.label} className="flex-row items-center gap-1.5">
              <Ionicons
                name={met ? 'checkmark-circle' : 'ellipse-outline'}
                size={14}
                color={met ? '#61754e' : '#b3c49f'}
              />
              <Text className={`font-body text-xs ${met ? 'text-sage-700' : 'text-sage-500'}`}>
                {rule.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
