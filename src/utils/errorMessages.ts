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

  if (normalized.includes('quote not found')) {
    return 'The selected quote could not be found. Please refresh and try again.';
  }

  if (normalized.includes('not available for acceptance')) {
    return 'This quote is no longer available for acceptance. It may have already been accepted, rejected, or expired.';
  }

  if (normalized.includes('only the client or admin can accept')) {
    return 'You do not have permission to accept this quote.';
  }

  if (normalized.includes('invalid quote amount')) {
    return 'This quote has an invalid amount and cannot be accepted. Please contact support.';
  }

  if (normalized.includes('client financial profile not found')) {
    return 'Your account financial profile could not be loaded. Please contact support.';
  }

  // The RPC wraps errors as "Failed to accept quote: <inner reason>". Extract
  // the inner reason so the user gets a meaningful message.
  const rpcWrapperMatch = normalized.match(/^failed to accept quote:\s*(.+)$/);
  if (rpcWrapperMatch) {
    const innerReason = rpcWrapperMatch[1].trim();
    // Recurse to apply known-pattern mapping on the inner reason.
    const innerMessage = rawMessage.replace(/^failed to accept quote:\s*/i, '').trim();
    const innerResult = getUserFacingError(new Error(innerMessage), fallback);
    if (innerResult !== fallback) return innerResult;
    // If the inner reason is safe to show, return it directly.
    if (innerReason.length > 0 && innerReason.length <= 200) {
      return innerReason.charAt(0).toUpperCase() + innerReason.slice(1) + '.';
    }
  }

  if (normalized.includes('invalid input value')) {
    return fallback;
  }

  return fallback;
}

