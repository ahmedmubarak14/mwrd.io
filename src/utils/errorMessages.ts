export function getUserFacingError(error: unknown, fallback: string): string {
  const rawMessage = typeof error === 'string'
    ? error
    : (error instanceof Error ? error.message : String((error as any)?.message || ''));
  const message = rawMessage.trim();

  if (!message) return fallback;

  const normalized = message.toLowerCase();
  if (
    normalized.includes('permission denied')
    || normalized.includes('row-level security')
    || normalized.includes('rls')
  ) {
    return 'You do not have permission to perform this action.';
  }

  if (normalized.includes('jwt') || normalized.includes('auth') || normalized.includes('token')) {
    return 'Your session has expired. Please sign in again.';
  }

  if (normalized.includes('network') || normalized.includes('fetch') || normalized.includes('timeout')) {
    return 'Network issue detected. Please check your connection and retry.';
  }

  if (normalized.includes('insufficient credit')) {
    return 'This action would exceed the available credit limit.';
  }

  if (normalized.includes('invalid input value')) {
    return fallback;
  }

  return fallback;
}

