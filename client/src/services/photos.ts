import { isBackendConfigured } from '@/config/api';
import { ApiError, apiGet, apiPost } from '@/services/api';

export type PickedPhoto = {
  uri: string;
  mimeType: string;
  fileName: string;
};

type UploadUrlResponse = {
  uploadUrl: string; // presigned S3 PUT URL
  key: string; // S3 object key the backend will store on the user
};

// Try-on (body) photo upload flow: a front and a back photo. The app never holds AWS credentials:
//   1. POST /api/photos/body/upload-url { contentType, fileName } -> { uploadUrl, key }  (per photo)
//   2. PUT each image's bytes straight to S3 at its uploadUrl
//   3. POST /api/photos/body { frontKey, backKey } -> { photoId }
// The server makes the other angles in the background afterwards (see `anglesReady` on GET).
// A new upload replaces all of the user's try-on photos and the saved try-ons made from them.
// Resolves to the new photo's id.
// Until EXPO_PUBLIC_API_URL is set, this resolves locally so the flow stays walkable.
export async function uploadBodyPhotos(front: PickedPhoto, back: PickedPhoto): Promise<string> {
  if (!isBackendConfigured) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return 'local-placeholder';
  }

  const [frontKey, backKey] = await Promise.all([uploadOne(front), uploadOne(back)]);
  return confirmBodyPhotoUpload(frontKey, backKey);
}

async function uploadOne(photo: PickedPhoto): Promise<string> {
  const { uploadUrl, key } = await requestBodyPhotoUploadUrl(photo);
  await uploadToS3(uploadUrl, photo);
  return key;
}

// The server only accepts JPEG, PNG and WebP (400 otherwise).
export function requestBodyPhotoUploadUrl(photo: PickedPhoto): Promise<UploadUrlResponse> {
  return apiPost<UploadUrlResponse>('/api/photos/body/upload-url', {
    contentType: photo.mimeType,
    fileName: photo.fileName,
  });
}

// Content-Type must match what the URL was presigned with, or S3 rejects the PUT.
export async function uploadToS3(uploadUrl: string, photo: PickedPhoto): Promise<void> {
  const blob = await (await fetch(photo.uri)).blob();
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': photo.mimeType },
    body: blob,
  });
  if (!response.ok) {
    throw new Error('Could not upload your photo. Please try again.');
  }
}

// The server checks both uploads finished (404 otherwise) and that the keys differ (400).
export async function confirmBodyPhotoUpload(frontKey: string, backKey: string): Promise<string> {
  const result = await apiPost<{ photoId: string }>('/api/photos/body', { frontKey, backKey });
  return result.photoId;
}

export type BodyPhoto = {
  photoId: string;
  imageUrl: string; // the front photo
  anglesReady: boolean; // the server has made the other angles, so the 360° spin is complete
  needsRetake: boolean; // an old single-photo upload: they need to take front + back to use try-on
};

// GET /api/photos/body: the user's try-on photos, or null if they haven't added any (404).
export async function getBodyPhoto(): Promise<BodyPhoto | null> {
  try {
    return await apiGet<BodyPhoto>('/api/photos/body');
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
