import * as dns from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import * as zlib from 'node:zlib';
import type { Readable } from 'node:stream';

// Fetching URLs that users paste, without letting them reach our own network
// (SSRF). Every address a hostname resolves to is checked at the moment we
// connect, so a site can't pass the check and then switch its DNS to a private
// address. Only http/https on standard ports, at most 5 redirects (each checked
// the same way), a time limit, and a size limit that also covers decompression.

// A user-facing reason the fetch failed. The message is safe to show in the app.
export class LinkFetchError extends Error {}

export type FetchedBody = { body: Buffer; contentType: string; finalUrl: URL };

type Options = {
  maxBytes: number; // after decompression
  accept: string;
  timeoutMs?: number; // whole request, including redirects
};

const MAX_REDIRECTS = 5;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

export async function safeFetch(rawUrl: string | URL, options: Options): Promise<FetchedBody> {
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);
  let url = checkUrl(rawUrl);

  for (let redirects = 0; ; redirects++) {
    const response = await request(url, options, deadline);
    if (response.redirectTo) {
      if (redirects >= MAX_REDIRECTS) throw new LinkFetchError('That link redirects too many times.');
      url = checkUrl(new URL(response.redirectTo, url));
      continue;
    }
    return { body: response.body!, contentType: response.contentType, finalUrl: url };
  }
}

// http or https only, on the standard port, with no username or password.
export function checkUrl(raw: string | URL): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new LinkFetchError('Enter a full link, starting with https://');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LinkFetchError('Only http and https links can be added.');
  }
  if (url.port !== '' || url.username || url.password) {
    throw new LinkFetchError("That link can't be used.");
  }
  // Node skips the DNS lookup (and so checkedLookup) for raw IP addresses, so
  // check those here. IPv6 hostnames come wrapped in [brackets].
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && !isPublicAddress(host)) {
    throw new LinkFetchError("That link can't be used.");
  }
  return url;
}

// ---- Which addresses are allowed ----

const PRIVATE = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) PRIVATE.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) PRIVATE.addSubnet(net, prefix, 'ipv6');

// True only for ordinary public internet addresses.
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !PRIVATE.check(address, 'ipv4');
  if (family !== 6) return false;
  // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged as IPv4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublicAddress(mapped[1]);
  return !PRIVATE.check(address, 'ipv6');
}

// Used by Node for every connection: resolves the hostname, and refuses to
// connect if any of its addresses isn't public.
const checkedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
      return callback(new LinkFetchError("That link can't be used."), '', 0);
    }
    if ((options as dns.LookupOptions).all) {
      (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
};

// ---- One request ----

type RawResponse = { redirectTo?: string; body?: Buffer; contentType: string };

function request(url: URL, options: Options, deadline: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new LinkFetchError('That page took too long to respond.'));

    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(
      url,
      {
        lookup: checkedLookup,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: options.accept,
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirectTo: res.headers.location, contentType: '' });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new LinkFetchError("Couldn't open that page. The store may block apps from reading it."));
        }
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > options.maxBytes) {
          res.destroy();
          return reject(new LinkFetchError('That page is too large.'));
        }

        const stream = decompress(res, res.headers['content-encoding']);
        const chunks: Buffer[] = [];
        let size = 0;
        stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            stream.destroy();
            res.destroy();
            reject(new LinkFetchError('That page is too large.'));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () =>
          resolve({ body: Buffer.concat(chunks), contentType: String(res.headers['content-type'] ?? '') }),
        );
        stream.on('error', () => reject(new LinkFetchError("Couldn't open that page.")));
      },
    );

    const timer = setTimeout(() => {
      req.destroy(new LinkFetchError('That page took too long to respond.'));
    }, remaining);
    req.on('close', () => clearTimeout(timer));
    req.on('error', (err) => {
      reject(err instanceof LinkFetchError ? err : new LinkFetchError("Couldn't open that page. Check the link."));
    });
  });
}

function decompress(res: Readable, encoding: string | string[] | undefined): Readable {
  switch (String(encoding ?? '').toLowerCase()) {
    case 'gzip':
    case 'x-gzip':
      return res.pipe(zlib.createGunzip());
    case 'deflate':
      return res.pipe(zlib.createInflate());
    case 'br':
      return res.pipe(zlib.createBrotliDecompress());
    default:
      return res;
  }
}