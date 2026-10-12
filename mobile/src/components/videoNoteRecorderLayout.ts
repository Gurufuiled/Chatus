/**
 * Размеры нижней панели записи видеокружка. Вынесены отдельно (без react-native),
 * чтобы выравнивание «таймер — отмена — отправить» и рейл «камера/VIDEO» можно было проверить тестом.
 */

/** Диаметр кнопки отправки. */
export const SEND_BUTTON_SIZE = 52;
/** Внутренний отступ плашки: кнопка отправки концентрична её скруглению. */
export const BAR_INSET = 4;
/** Высота плашки = кнопка отправки + отступы по краям, поэтому всё в одну линию. */
export const BAR_HEIGHT = SEND_BUTTON_SIZE + BAR_INSET * 2;
export const BAR_RADIUS = BAR_HEIGHT / 2;
/** Высота пилюли с таймером: ровно по центру плашки. */
export const TIMER_PILL_HEIGHT = 34;
/** Ширина колонки «камера / VIDEO» = ширина кнопки отправки, центры лежат на одной вертикали. */
export const RAIL_WIDTH = SEND_BUTTON_SIZE;
/** Диаметр кнопки переключения камеры. */
export const FLIP_BUTTON_SIZE = 44;
/** Вертикальный зазор между рейлом и плашкой. */
export const RAIL_BOTTOM_GAP = 14;

/** Расстояние от центра кнопки до правого края контента — у отправки и у рейла одинаковое. */
export function rightCenterOffset(width: number, rightInset = 0): number {
  return rightInset + width / 2;
}
