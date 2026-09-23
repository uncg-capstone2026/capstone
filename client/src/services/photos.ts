import { API_BASE_URL, isBackendConfigured } from '@/config/api';

export type PickedPhoto = {
  uri: string;
  mimeType: string;
  fileName: string;
};

type UploadUrlResponse = {
  uploadUrl: string; // presigned S3 PUT URL
  key: string; // S3 object key the backend will store on the user
};

// Try-on (body) photo upload flow. The app never holds AWS credentials:
//   1. POST /api/photos/body/upload-url { contentType, fileName } -> { uploadUrl, key }
//   2. PUT the image bytes straight to S3 at uploadUrl
//   3. POST /api/photos/body { key } -> { key }  (backend saves it on the user)
// Until EXPO_PUBLIC_API_URL is set, this resolves locally so the flow stays walkable.
export async function uploadBodyPhoto(photo: PickedPhoto): Promise<string> {
  if (!isBackendConfigured) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return 'local-placeholder';
  }

  const { uploadUrl, key } = await requestBodyPhotoUploadUrl(photo);
  await uploadToS3(uploadUrl, photo);
  return confirmBodyPhotoUpload(key);
}

// TODO: backend route not built yet. It should validate contentType is an image,
// generate a per-user key, and return a short-lived presigned PUT URL.
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

// TODO: backend route not built yet. It should confirm the object exists in S3
// and save the key on the user's record.
export async function confirmBodyPhotoUpload(key: string): Promise<string> {
  const result = await apiPost<{ key: string }>('/api/photos/body', { key });
  return result.key;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    // TODO: add the session's Authorization header once auth is wired up.
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error('Something went wrong. Please try again.');
  }
  return (await response.json()) as T;
}
