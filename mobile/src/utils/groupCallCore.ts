/**
 * Чистые функции группового звонка (без react-native / livekit): нормализация времени начала.
 * Покрыты тестами в `groupCallCore.test.ts`.
 */

/** Меньше этого значения число считаем секундами Unix, а не миллисекундами. */
const MS_THRESHOLD = 1_000_000_000_000;

function toMillis(value: number): number | undefined {
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value < MS_THRESHOLD ? value * 1000 : value;
}

/**
 * Приводит время начала звонка (число секунд/мс, строка с числом или ISO-дата) к миллисекундам.
 * Строка из одних цифр — это число (секунды/мс), а не дата: `Date.parse('1700000000')` ненадёжен
 * (в разных движках даёт NaN или «год»), поэтому числовые строки разбираем первыми.
 */
export function normalizeStartedAt(startedAt: number | string | undefined | null): number | undefined {
  if (typeof startedAt === 'number') return toMillis(startedAt);
  if (typeof startedAt === 'string') {
    const trimmed = startedAt.trim();
    if (!trimmed) return undefined;
    if (/^\d+(\.\d+)?$/.test(trimmed)) return toMillis(Number(trimmed));
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

/** Первое пригодное значение из списка кандидатов (в миллисекундах). */
export function resolveCallStartedAt(
  ...candidates: Array<number | string | undefined | null>
): number | undefined {
  for (const candidate of candidates) {
    const normalized = normalizeStartedAt(candidate);
    if (normalized != null) return normalized;
  }
  return undefined;
}
