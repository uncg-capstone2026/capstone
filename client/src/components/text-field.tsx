import { Text, TextInput, View, type TextInputProps } from 'react-native';

type TextFieldProps = Omit<TextInputProps, 'className'> & {
  className?: string; // the box: height, border, background, corners (no padding)
  textClassName?: string; // side padding and font, shared by the text and the placeholder
};

// A single-line text box with its own placeholder. iOS's built-in placeholder drifts below the
// cursor after the field autofocuses or the keyboard opens, so ours is drawn on top instead:
// same font and padding as the text, centered, and shown only while the field is empty.
export function TextField({
  className = '',
  textClassName = '',
  placeholder,
  placeholderTextColor,
  accessibilityHint,
  value,
  ...props
}: TextFieldProps) {
  return (
    <View className={`overflow-hidden ${className}`}>
      <TextInput
        value={value}
        accessibilityHint={accessibilityHint ?? placeholder}
        className={`flex-1 ${textClassName}`}
        {...props}
      />
      {placeholder && !value ? (
        <View pointerEvents="none" className="absolute inset-0 justify-center">
          <Text numberOfLines={1} className={textClassName} style={{ color: placeholderTextColor as string }}>
            {placeholder}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
