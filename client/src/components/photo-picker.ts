import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

import type { PickedPhoto } from '@/services/photos';

export type PhotoSource = 'library' | 'camera' | 'files';

const DEFAULT_FILE_NAME = 'photo.jpg';

// The only types the upload routes accept. Anything else (e.g. HEIC from iOS) is converted to JPEG.
const UPLOADABLE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const SOURCE_OPTIONS: { source: PhotoSource; label: string }[] = [
  { source: 'library', label: 'Photo Library' },
  { source: 'camera', label: 'Take Photo' },
  { source: 'files', label: 'Choose File' },
];

// Shows the native action sheet on iOS; Android/web fall back to an Alert
// (tapping outside it cancels, since Android caps Alerts at three buttons).
export function choosePhotoSource(): Promise<PhotoSource | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...SOURCE_OPTIONS.map((option) => option.label), 'Cancel'],
          cancelButtonIndex: SOURCE_OPTIONS.length,
        },
        (index) => resolve(SOURCE_OPTIONS[index]?.source ?? null),
      );
      return;
    }

    Alert.alert(
      'Add photo',
      undefined,
      SOURCE_OPTIONS.map(({ source, label }) => ({ text: label, onPress: () => resolve(source) })),
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}

// Returns the picked image, or null if the user cancelled.
// No allowsEditing: the crop UI would force a square and cut off the full body.
export async function pickPhoto(source: PhotoSource): Promise<PickedPhoto | null> {
  if (source === 'files') {
    const result = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
    if (result.canceled) return null;
    const { uri, mimeType, name } = result.assets[0];
    return toUploadable(uri, mimeType, name);
  }

  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      throw new Error('Camera access is off. Enable it in Settings to take a photo.');
    }
    result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
  } else {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      throw new Error('Photo access is off. Enable it in Settings to choose a photo.');
    }
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  }

  if (result.canceled) return null;
  const { uri, mimeType, fileName } = result.assets[0];
  return toUploadable(uri, mimeType, fileName);
}

// JPEG, PNG and WebP pass through. Anything else, or an unknown type, is re-encoded as JPEG.
async function toUploadable(
  uri: string,
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
): Promise<PickedPhoto> {
  const name = fileName || DEFAULT_FILE_NAME;
  if (mimeType && UPLOADABLE_MIME_TYPES.includes(mimeType)) {
    return { uri, mimeType, fileName: name };
  }

  try {
    const image = await ImageManipulator.manipulate(uri).renderAsync();
    const jpeg = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
    return { uri: jpeg.uri, mimeType: 'image/jpeg', fileName: name.replace(/\.[^.]*$/, '') + '.jpg' };
  } catch {
    throw new Error("This photo's format isn't supported. Choose a JPEG, PNG or WebP image.");
  }
}
