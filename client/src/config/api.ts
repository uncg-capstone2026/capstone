// Set EXPO_PUBLIC_API_URL in .env.local (see .env.example). Expo inlines it at build time.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

export const isBackendConfigured = Boolean(API_BASE_URL);
