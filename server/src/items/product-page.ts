// Finds a product's photo and name in a store's page. Stores describe products
// for Google in two standard ways, tried in this order:
//   1. JSON-LD: <script type="application/ld+json"> with a schema.org "Product"
//   2. Open Graph / Twitter meta tags: og:image, og:title, twitter:image
// Then the page's <title> for the name. Relative image links are resolved
// against the page's address.

export type ProductInfo = { imageUrl: URL | null; name: string | null };

export function findProduct(html: string, pageUrl: URL): ProductInfo {
  const product = findJsonLdProduct(html);
  const meta = readMetaTags(html);

  const imageCandidates = [
    product ? firstImage(product.image) : null,
    meta['og:image:secure_url'],
    meta['og:image'],
    meta['og:image:url'],
    meta['twitter:image'],
    meta['twitter:image:src'],
  ];
  let imageUrl: URL | null = null;
  for (const candidate of imageCandidates) {
    imageUrl = toHttpUrl(candidate, pageUrl);
    if (imageUrl) break;
  }

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const name = cleanName(
    (typeof product?.name === 'string' ? product.name : null) ??
      meta['og:title'] ??
      meta['twitter:title'] ??
      (title ? decodeEntities(title) : null),
  );

  return { imageUrl, name };
}

// ---- JSON-LD ----

type JsonObject = Record<string, unknown>;

function findJsonLdProduct(html: string): JsonObject | null {
  const scripts = html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, text] of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(text.trim());
    } catch {
      continue; // some stores ship broken JSON-LD; skip it
    }
    const product = searchForProduct(data, 0);
    if (product) return product;
  }
  return null;
}

// Depth-first search through arrays, @graph and nested objects for a Product.
function searchForProduct(node: unknown, depth: number): JsonObject | null {
  if (depth > 6 || !node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = searchForProduct(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as JsonObject;
  const types = ([] as unknown[]).concat(obj['@type'] ?? []);
  if (types.some((t) => t === 'Product' || t === 'ProductGroup')) return obj;
  for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item', 'hasVariant']) {
    const found = searchForProduct(obj[key], depth + 1);
    if (found) return found;
  }
  return null;
}

// image can be "url", ["url", ...], { url } / { contentUrl }, or a list of those.
function firstImage(image: unknown): string | null {
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) {
    for (const entry of image) {
      const url = firstImage(entry);
      if (url) return url;
    }
    return null;
  }
  if (image && typeof image === 'object') {
    const obj = image as JsonObject;
    return firstImage(obj.url ?? obj.contentUrl ?? null);
  }
  return null;
}

// ---- Meta tags ----

// property= or name= -> content, first value wins, keys lowercased.
function readMetaTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = readAttributes(tag);
    const key = (attrs.property ?? attrs.name ?? '').toLowerCase();
    if (key && attrs.content && !(key in tags)) tags[key] = decodeEntities(attrs.content);
  }
  return tags;
}

function readAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [, name, , quoted, bare] of tag.matchAll(/([\w:-]+)\s*=\s*(?:(["'])([\s\S]*?)\2|([^\s>]+))/g)) {
    attrs[name.toLowerCase()] = quoted ?? bare ?? '';
  }
  return attrs;
}

// ---- Helpers ----

function toHttpUrl(value: string | null | undefined, base: URL): URL | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(decodeEntities(value.trim()), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

// Collapsed whitespace, at most 60 characters (the item name limit).
function cleanName(value: string | null | undefined): string | null {
  const name = value?.replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return name.length > 60 ? `${name.slice(0, 59).trimEnd()}…` : name;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', '#39': "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower in NAMED_ENTITIES) return NAMED_ENTITIES[lower];
    if (lower.startsWith('#x')) return safeCodePoint(parseInt(lower.slice(2), 16), match);
    if (lower.startsWith('#')) return safeCodePoint(parseInt(lower.slice(1), 10), match);
    return match;
  });
}

function safeCodePoint(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}