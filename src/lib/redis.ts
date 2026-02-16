import { Redis } from '@upstash/redis';

const FALLBACK_TTL_MS = 12 * 60 * 60 * 1000;

class InMemoryStore {
  private data = new Map<string, { value: unknown; expiresAt: number }>();

  get<T>(key: string): T | null {
    const item = this.data.get(key);
    if (!item) {
      return null;
    }

    if (Date.now() > item.expiresAt) {
      this.data.delete(key);
      return null;
    }

    return item.value as T;
  }

  set(key: string, value: unknown, ttlSeconds?: number): void {
    const ttl = ttlSeconds ? ttlSeconds * 1000 : FALLBACK_TTL_MS;
    this.data.set(key, { value, expiresAt: Date.now() + ttl });
  }

  del(key: string): void {
    this.data.delete(key);
  }

  keys(prefix?: string): string[] {
    const now = Date.now();
    const results: string[] = [];

    for (const [key, record] of this.data.entries()) {
      if (record.expiresAt < now) {
        this.data.delete(key);
        continue;
      }
      if (!prefix || key.startsWith(prefix)) {
        results.push(key);
      }
    }

    return results;
  }

  incr(key: string): number {
    const current = Number(this.get<number>(key) || 0) + 1;
    this.set(key, current, 7 * 24 * 60 * 60);
    return current;
  }

  clearByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.keys()) {
      if (key.startsWith(prefix)) {
        this.del(key);
        count += 1;
      }
    }
    return count;
  }
}

const memoryStore = new InMemoryStore();

function resolveUpstashCredentials(): { url: string; token: string } | null {
  if (process.env.REDIS_URL && process.env.REDIS_TOKEN) {
    try {
      const parsed = new URL(process.env.REDIS_URL);
      const isHttp = parsed.protocol === 'https:' || parsed.protocol === 'http:';
      if (isHttp) {
        return { url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN };
      }
    } catch {
      // Ignore invalid REDIS_URL format and continue fallback resolution.
    }
  }

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return {
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN
    };
  }

  if (process.env.REDIS_URL && !process.env.REDIS_TOKEN) {
    try {
      const parsed = new URL(process.env.REDIS_URL);
      const token = parsed.searchParams.get('token') || parsed.password;
      const isHttp = parsed.protocol === 'https:' || parsed.protocol === 'http:';
      if (token && isHttp) {
        parsed.searchParams.delete('token');
        parsed.password = '';
        parsed.username = '';
        return { url: parsed.toString(), token };
      }
    } catch {
      return null;
    }
  }

  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    };
  }

  return null;
}

const redisClient = (() => {
  const credentials = resolveUpstashCredentials();
  if (credentials) {
    return new Redis({
      url: credentials.url,
      token: credentials.token
    });
  }

  return null;
})();

export async function redisGet<T>(key: string): Promise<T | null> {
  if (!redisClient) {
    return memoryStore.get<T>(key);
  }

  const value = await redisClient.get<T>(key);
  return value ?? null;
}

export async function redisSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (!redisClient) {
    memoryStore.set(key, value, ttlSeconds);
    return;
  }

  if (ttlSeconds) {
    await redisClient.set(key, value, { ex: ttlSeconds });
    return;
  }

  await redisClient.set(key, value);
}

export async function redisDelete(key: string): Promise<void> {
  if (!redisClient) {
    memoryStore.del(key);
    return;
  }

  await redisClient.del(key);
}

export async function redisKeys(pattern: string): Promise<string[]> {
  if (!redisClient) {
    const prefix = pattern.replace('*', '');
    return memoryStore.keys(prefix);
  }

  const keys = await redisClient.keys(pattern);
  return keys as string[];
}

export async function redisIncr(key: string): Promise<number> {
  if (!redisClient) {
    return memoryStore.incr(key);
  }

  return redisClient.incr(key);
}

export async function redisClearPrefix(prefix: string): Promise<number> {
  const keys = await redisKeys(`${prefix}*`);
  if (!keys.length) {
    return 0;
  }

  if (!redisClient) {
    return memoryStore.clearByPrefix(prefix);
  }

  await redisClient.del(...keys);
  return keys.length;
}

export async function redisStatus(): Promise<{ mode: 'upstash' | 'memory'; keyCount: number }> {
  const keys = await redisKeys('*');
  return {
    mode: redisClient ? 'upstash' : 'memory',
    keyCount: keys.length
  };
}
