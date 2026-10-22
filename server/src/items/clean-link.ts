// Removes ad and analytics tracking from a store link, so the same product
// pasted from different places (a Google ad, Instagram, an email) is saved
// and recognized as one link. Only tracking parameters are removed; anything
// that can change the product shown (size, color, variant) is kept.

// Exact parameter names, lowercase.
const TRACKING_PARAMS = new Set([
  // Google Ads and Analytics
  'gclid', 'gclsrc', 'gbraid', 'wbraid', 'dclid', 'gad_source', 'gad_campaignid', '_ga', '_gl', 'srsltid',
  // Meta, Microsoft, TikTok, X, LinkedIn, Instagram
  'fbclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id', 'igshid', 'igsh',
  // Email and store campaign tags
  'mc_cid', 'mc_eid', 'cm_mmc', 'cmpid', '_kx', 'klaviyo_id',
]);

// Parameter name prefixes, lowercase (e.g. utm_source, utm_campaign).
const TRACKING_PREFIXES = ['utm_', 'pk_', 'mtm_'];

function isTracking(name: string): boolean {
  const lower = name.toLowerCase();
  return TRACKING_PARAMS.has(lower) || TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

// A copy of the link without tracking parameters or #fragment.
export function cleanLink(url: URL): URL {
  const clean = new URL(url.href);
  for (const name of [...clean.searchParams.keys()]) {
    if (isTracking(name)) clean.searchParams.delete(name);
  }
  clean.hash = '';
  return clean;
}