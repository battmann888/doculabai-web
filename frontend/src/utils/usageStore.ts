const FREE_DAILY_LIMIT = 5;

function usageKey(userId: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `doculabai.usage.${userId}.${today}`;
}

export function getUsageCount(userId: string): number {
  try {
    const raw = localStorage.getItem(usageKey(userId));
    if (!raw) return 0;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(Math.max(value, 0), FREE_DAILY_LIMIT) : 0;
  } catch {
    return 0;
  }
}

export function incrementUsageCount(userId: string): number {
  const next = Math.min(getUsageCount(userId) + 1, FREE_DAILY_LIMIT);
  localStorage.setItem(usageKey(userId), String(next));
  return next;
}

export function isUsageLimitReached(userId: string): boolean {
  return getUsageCount(userId) >= FREE_DAILY_LIMIT;
}

export { FREE_DAILY_LIMIT };
