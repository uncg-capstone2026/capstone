import type { ImageSource } from 'expo-image';

// Image source for a URL from our server. Signed S3 URLs get a new signature each time the
// server sends them, so caching by the full URL never hits and every view downloads the image
// again. Caching by the path (the S3 key) downloads each image once. The cutout has its own key,
// so an item still switches from the original to its cutout when that's ready.
export function remoteImage(url: string): ImageSource {
  const isSigned = url.includes('X-Amz-Signature=');
  return { uri: url, cacheKey: isSigned ? url.split('?')[0] : url };
}
