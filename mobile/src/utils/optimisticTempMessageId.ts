/**
 * Client-generated id for optimistic rows before the server assigns stable ids.
 * Includes randomness so two sends in the same millisecond cannot collide.
 */
export function makeOptimisticTempMessageId(): string {
  const rnd = Math.random().toString(36).slice(2, 11);
  return `temp-${Date.now()}-${rnd}`;
}
