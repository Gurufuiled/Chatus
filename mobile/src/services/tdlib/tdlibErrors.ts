/** TDLib JSON: ответ с `@type":"error"`. */
export function isTdError(result: unknown): result is { '@type': 'error'; message: string } {
  return !!result && typeof result === 'object' && (result as { '@type'?: string })['@type'] === 'error';
}

export function throwIfTdError(result: unknown): void {
  if (isTdError(result)) {
    throw new Error(result.message ?? 'TDLib error');
  }
}
