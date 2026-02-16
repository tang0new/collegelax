const requestMap = new Map<string, number>();

export function isRateLimited(key: string, windowMs: number): boolean {
  const now = Date.now();
  const last = requestMap.get(key);

  if (last && now - last < windowMs) {
    return true;
  }

  requestMap.set(key, now);
  return false;
}
