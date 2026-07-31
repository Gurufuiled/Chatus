export const COMPOSER_INPUT_MIN_HEIGHT = 44;
export const COMPOSER_INPUT_MAX_HEIGHT = 132;
export const COMPOSER_INPUT_VERTICAL_PADDING = 21;

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

export function composerInputHeightForLineCount(
  lineCount: number,
  lineHeight: number,
): number {
  const safeLineCount =
    Number.isFinite(lineCount) && lineCount > 0 ? Math.ceil(lineCount) : 1;
  const safeLineHeight =
    Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 1;
  return clampComposerInputHeight(
    safeLineCount * safeLineHeight + COMPOSER_INPUT_VERTICAL_PADDING,
  );
}
