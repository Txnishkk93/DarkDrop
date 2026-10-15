import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ExtractorError } from "@/lib/server/errors";

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const MAX_COOLDOWN_ENTRIES = 100;
const DEFAULT_MAX_EXTRACTIONS = 2;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30 * 1000;

type CacheEntry<T> = { expiresAt: number; value: T };
type ReliabilityState = {
  cache: Map<string, CacheEntry<unknown>>;
  inFlight: Map<string, Promise<unknown>>;
  cooldowns: Map<string, number>;
  activeExtractions: number;
};

const globalState = globalThis as typeof globalThis & {
  __darkdropReliability?: ReliabilityState;
};
const state =
  globalState.__darkdropReliability ??
  (globalState.__darkdropReliability = {
    cache: new Map(),
    inFlight: new Map(),
    cooldowns: new Map(),
    activeExtractions: 0,
  });

function getPositiveInteger(name: string, fallback: number, max: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new ExtractorError(`Server configuration ${name} must be an integer from 1 to ${max}.`, {
      code: "invalid_server_configuration",
      status: 500,
    });
  }
  return value;
}

export function getMetadataCacheTtlMs(): number {
  return getPositiveInteger("MEDIA_INFO_CACHE_TTL_MS", DEFAULT_CACHE_TTL_MS, 60 * 60 * 1000);
}

export function getMaxConcurrentExtractions(): number {
  return getPositiveInteger("MEDIA_MAX_CONCURRENT_EXTRACTIONS", DEFAULT_MAX_EXTRACTIONS, 20);
}

export function getMaxConcurrentDownloads(): number {
  return getPositiveInteger("MEDIA_MAX_CONCURRENT_DOWNLOADS", 2, 20);
}

export function getRequestTimeoutMs(): number {
  return getPositiveInteger("MEDIA_REQUEST_TIMEOUT_MS", 30 * 1000, 5 * 60 * 1000);
}

export function getJobTtlMs(): number {
  return getPositiveInteger("MEDIA_JOB_TTL_MS", 15 * 60 * 1000, 24 * 60 * 60 * 1000);
}

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b, c] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);
    return isIP(mappedIpv4) === 4 && isPublicIpv4(mappedIpv4);
  }
  // Globally reachable unicast IPv6 addresses are in 2000::/3.
  return (
    (normalized.startsWith("2") || normalized.startsWith("3")) &&
    !normalized.startsWith("2001:db8:") &&
    !normalized.startsWith("2001:0000:") &&
    !normalized.startsWith("2001:10:") &&
    !normalized.startsWith("2001:20:")
  );
}

function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  return version === 4 ? isPublicIpv4(address) : version === 6 && isPublicIpv6(address);
}

export async function normalizeAndValidateMediaUrl(rawUrl: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new ExtractorError("Enter a valid public http(s) media URL.", {
      code: "invalid_url",
      status: 400,
    });
  }

  const normalizedHostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    !parsed.hostname ||
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".local")
  ) {
    throw new ExtractorError("Enter a valid public http(s) media URL.", {
      code: "invalid_url",
      status: 400,
    });
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  try {
    const addresses =
      isIP(hostname) !== 0
        ? [{ address: hostname }]
        : await lookup(hostname, { all: true, verbatim: true });

    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
      throw new ExtractorError("Private or restricted network addresses are not allowed.", {
        code: "url_not_allowed",
        status: 400,
      });
    }
  } catch (error) {
    if (error instanceof ExtractorError) throw error;
    throw new ExtractorError("The URL host could not be resolved.", {
      code: "invalid_url",
      status: 400,
    });
  }

  parsed.hash = "";
  return parsed.toString();
}

function retryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof ExtractorError)) return undefined;
  return error.retryAfterMs;
}

export function assertOutsideRateLimitCooldown(rawUrl: string): void {
  const hostname = new URL(rawUrl).hostname.toLowerCase();
  const cooldownUntil = state.cooldowns.get(hostname) ?? 0;
  if (cooldownUntil <= Date.now()) return;

  const remaining = cooldownUntil - Date.now();
  throw new ExtractorError("The source is rate-limiting requests. Please wait before trying again.", {
    code: "upstream_rate_limited",
    status: 429,
    retryable: true,
    retryAfterMs: remaining,
  });
}

export function startRateLimitCooldown(rawUrl: string, durationMs?: number): void {
  const hostname = new URL(rawUrl).hostname.toLowerCase();
  for (const [host, expiresAt] of state.cooldowns) {
    if (expiresAt <= Date.now()) state.cooldowns.delete(host);
  }
  state.cooldowns.set(hostname, Date.now() + (durationMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS));
  if (state.cooldowns.size > MAX_COOLDOWN_ENTRIES) {
    const oldest = state.cooldowns.keys().next().value;
    if (oldest) state.cooldowns.delete(oldest);
  }
}

export async function runBoundedExtraction<T>(producer: () => Promise<T>): Promise<T> {
  if (state.activeExtractions >= getMaxConcurrentExtractions()) {
    throw new ExtractorError("Metadata requests are busy. Please try again shortly.", {
      code: "service_busy",
      status: 503,
      retryable: true,
      retryAfterMs: 5000,
    });
  }

  state.activeExtractions += 1;
  try {
    return await producer();
  } finally {
    state.activeExtractions -= 1;
  }
}

export async function getCachedMetadata<T>(
  normalizedUrl: string,
  producer: () => Promise<T>,
): Promise<T> {
  const parsedUrl = new URL(normalizedUrl);
  const containsCredential = Array.from(parsedUrl.searchParams.keys()).some((key) =>
    /token|auth|cookie|session|secret|signature|credential|policy|expires|jwt|^key$/i.test(key),
  );
  if (containsCredential) return runBoundedExtraction(producer);

  const now = Date.now();
  const cached = state.cache.get(normalizedUrl) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) state.cache.delete(normalizedUrl);

  const active = state.inFlight.get(normalizedUrl) as Promise<T> | undefined;
  if (active) return active;

  const hostname = new URL(normalizedUrl).hostname.toLowerCase();
  assertOutsideRateLimitCooldown(normalizedUrl);

  const pending = runBoundedExtraction(producer)
    .then((value) => {
      const ttl = getMetadataCacheTtlMs();
      if (ttl > 0) {
        state.cache.delete(normalizedUrl);
        state.cache.set(normalizedUrl, { value, expiresAt: Date.now() + ttl });
        if (state.cache.size > MAX_CACHE_ENTRIES) {
          const oldest = state.cache.keys().next().value;
          if (oldest) state.cache.delete(oldest);
        }
      }
      return value;
    })
    .catch((error: unknown) => {
      const retryMs = retryAfterMs(error);
      if (error instanceof ExtractorError && error.status === 429) {
        startRateLimitCooldown(normalizedUrl, retryMs);
      }
      throw error;
    })
    .finally(() => {
      state.inFlight.delete(normalizedUrl);
    });

  state.inFlight.set(normalizedUrl, pending);
  return pending;
}
