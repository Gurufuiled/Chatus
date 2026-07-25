export const COMPOSER_INPUT_MIN_HEIGHT = 44;
export const COMPOSER_INPUT_MAX_HEIGHT = 116;

export function clampComposerInputHeight(contentHeight: number): number {
  if (!Number.isFinite(contentHeight)) {
    return COMPOSER_INPUT_MIN_HEIGHT;
  }
  return Math.max(
    COMPOSER_INPUT_MIN_HEIGHT,
    Math.min(COMPOSER_INPUT_MAX_HEIGHT, Math.ceil(contentHeight)),
  );
}

export function shouldScrollComposerInput(inputHeight: number): boolean {
  return inputHeight >= COMPOSER_INPUT_MAX_HEIGHT;
}
