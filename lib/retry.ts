type RetryOptions = {
  retries?: number;
  delaysMs?: number[];
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

function getErrorMessages(error: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();

  let current: unknown = error;
  while (current && !seen.has(current)) {
    seen.add(current);

    if (current instanceof Error) {
      if (current.message) messages.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
      continue;
    }

    if (typeof current === 'string') {
      messages.push(current);
      break;
    }

    if (typeof current === 'object' && current !== null) {
      const maybeMessage = Reflect.get(current, 'message');
      if (typeof maybeMessage === 'string' && maybeMessage) {
        messages.push(maybeMessage);
      }
      current = Reflect.get(current, 'cause');
      continue;
    }

    break;
  }

  return messages;
}

export function isRetryableError(error: unknown): boolean {
  const joined = getErrorMessages(error).join(' | ').toLowerCase();
  if (!joined) return false;

  return [
    'fetch failed',
    'network',
    'socket',
    'other side closed',
    'und_err',
    'econnreset',
    'etimedout',
    'timed out',
    'timeout',
    'eai_again',
    'enotfound',
    'connection reset',
    'connection terminated',
    'service unavailable',
    'bad gateway',
    'gateway timeout',
    'too many requests',
    'rate limit',
  ].some((needle) => joined.includes(needle));
}

export async function retry<T>(
  fn: () => Promise<T>,
  {
    retries = 2,
    delaysMs = [1000, 3000, 7000],
    shouldRetry = isRetryableError,
    onRetry,
  }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error, attempt + 1)) {
        throw error;
      }

      const delayMs = delaysMs[Math.min(attempt, delaysMs.length - 1)] ?? 1000;
      onRetry?.(error, attempt + 1, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
