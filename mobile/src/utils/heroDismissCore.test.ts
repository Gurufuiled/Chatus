import assert from 'node:assert/strict';
import {
  DISMISS_DISTANCE,
  DISMISS_VELOCITY,
  MIN_DRAG_SCALE,
  applyTransform,
  backdropOpacity,
  clamp,
  containFitRect,
  dragProgress,
  dragScale,
  fallbackTarget,
  heroFrameContentFit,
  heroTarget,
  isUsableSourceRect,
  transformedRect,
  shouldDismiss,
  type Rect,
  type Size,
} from './heroDismissCore';

const SCREEN: Size = { width: 400, height: 800 };
const near = (a: number, b: number, msg?: string) =>
  assert.ok(Math.abs(a - b) < 1e-6, msg ?? `expected ${a} ≈ ${b}`);

// --- clamp ---
assert.equal(clamp(5, 0, 3), 3);
assert.equal(clamp(-1, 0, 3), 0);
assert.equal(clamp(2, 0, 3), 2);

// --- containFitRect ---
{
  // квадрат в портретном экране: ширина по экрану, по центру по вертикали
  const r = containFitRect({ width: 1000, height: 1000 }, SCREEN);
  assert.deepEqual(r, { x: 0, y: 200, width: 400, height: 400 });
  // широкое фото
  const wide = containFitRect({ width: 2000, height: 1000 }, SCREEN);
  assert.deepEqual(wide, { x: 0, y: 300, width: 400, height: 200 });
  // высокое фото вписывается по высоте
  const tall = containFitRect({ width: 500, height: 2000 }, SCREEN);
  assert.deepEqual(tall, { x: 100, y: 0, width: 200, height: 800 });
  // неизвестный/битый размер → весь контейнер
  for (const bad of [null, undefined, { width: 0, height: 10 }, { width: 10, height: -1 }]) {
    assert.deepEqual(containFitRect(bad as Size | null | undefined, SCREEN), {
      x: 0,
      y: 0,
      width: 400,
      height: 800,
    });
  }
}

// --- dragProgress / dragScale / backdropOpacity ---
{
  assert.equal(dragProgress(0, 800), 0);
  assert.equal(dragProgress(180, 800), 0.5);
  assert.equal(dragProgress(-180, 800), 0.5, 'вверх так же, как вниз');
  assert.equal(dragProgress(5000, 800), 1, 'не больше 1');
  assert.equal(dragProgress(100, 0), 0, 'нулевая высота экрана не даёт NaN');

  assert.equal(dragScale(0), 1);
  near(dragScale(1), MIN_DRAG_SCALE);
  assert.ok(dragScale(0.5) < 1 && dragScale(0.5) > MIN_DRAG_SCALE);
  assert.equal(dragScale(7), dragScale(1), 'вне диапазона зажимается');

  assert.equal(backdropOpacity(0), 1);
  assert.equal(backdropOpacity(1), 0, 'в конце фон полностью прозрачен');
  assert.ok(backdropOpacity(0.3) < 1 && backdropOpacity(0.3) > 0);
  // монотонно убывает
  let prev = 1;
  for (let p = 0; p <= 1.0001; p += 0.1) {
    const v = backdropOpacity(p);
    assert.ok(v <= prev + 1e-9, 'opacity не растёт с прогрессом');
    prev = v;
  }
}

// --- shouldDismiss ---
{
  assert.equal(shouldDismiss(0, 0), false);
  assert.equal(shouldDismiss(DISMISS_DISTANCE - 1, 0), false, 'мало сдвинули');
  assert.equal(shouldDismiss(DISMISS_DISTANCE, 0), true);
  assert.equal(shouldDismiss(-DISMISS_DISTANCE, 0), true, 'вверх тоже закрывает');
  assert.equal(shouldDismiss(20, DISMISS_VELOCITY), true, 'бросок вниз при малом сдвиге');
  assert.equal(shouldDismiss(-20, -DISMISS_VELOCITY), true, 'бросок вверх');
  assert.equal(shouldDismiss(150, -DISMISS_VELOCITY), false, 'тянули вниз, но бросили обратно — не закрываем');
  assert.equal(shouldDismiss(-150, DISMISS_VELOCITY), false);
  assert.equal(shouldDismiss(0, DISMISS_VELOCITY), true, 'бросок без сдвига');
}

// --- heroTarget: фото ложится на миниатюру ---
{
  const fit: Rect = containFitRect({ width: 1000, height: 1000 }, SCREEN); // 400x400 по центру
  // та же рамка → тождественное преобразование
  const same = heroTarget({ ...fit }, fit, SCREEN);
  near(same.scale, 1);
  near(same.translateX, 0);
  near(same.translateY, 0);

  // миниатюра вдвое меньше по центру → scale 0.5, без сдвига
  const half = heroTarget({ x: 100, y: 300, width: 200, height: 200 }, fit, SCREEN);
  near(half.scale, 0.5);
  near(half.translateX, 0);
  near(half.translateY, 0);

  // произвольные миниатюры: центр вписанного фото должен попасть в центр миниатюры
  const cases: Rect[] = [
    { x: 10, y: 120, width: 120, height: 120 },
    { x: 270, y: 640, width: 100, height: 100 },
    { x: -20, y: 40, width: 130, height: 90 },
    { x: 150, y: 350, width: 160, height: 240 },
  ];
  for (const src of cases) {
    const t = heroTarget(src, fit, SCREEN);
    const mapped = applyTransform({ x: fit.x + fit.width / 2, y: fit.y + fit.height / 2 }, t, SCREEN);
    near(mapped.x, src.x + src.width / 2, `x center for ${JSON.stringify(src)}`);
    near(mapped.y, src.y + src.height / 2, `y center for ${JSON.stringify(src)}`);
    // миниатюра cover: фото должно покрывать её целиком
    assert.ok(fit.width * t.scale >= src.width - 1e-6);
    assert.ok(fit.height * t.scale >= src.height - 1e-6);
  }

  // нулевая вписанная рамка не даёт NaN
  const degenerate = heroTarget({ x: 0, y: 0, width: 50, height: 50 }, { x: 0, y: 0, width: 0, height: 0 }, SCREEN);
  assert.ok(Number.isFinite(degenerate.scale) && Number.isFinite(degenerate.translateX));
}

// --- isUsableSourceRect ---
{
  assert.equal(isUsableSourceRect(null, SCREEN), false);
  assert.equal(isUsableSourceRect(undefined, SCREEN), false);
  assert.equal(isUsableSourceRect({ x: 10, y: 10, width: 0, height: 50 }, SCREEN), false);
  assert.equal(isUsableSourceRect({ x: NaN, y: 10, width: 50, height: 50 }, SCREEN), false);
  assert.equal(isUsableSourceRect({ x: 10, y: 10, width: 100, height: 100 }, SCREEN), true);
  // целиком за экраном
  assert.equal(isUsableSourceRect({ x: 10, y: 900, width: 100, height: 100 }, SCREEN), false);
  assert.equal(isUsableSourceRect({ x: 10, y: -200, width: 100, height: 100 }, SCREEN), false);
  // едва выглядывает (<25%)
  assert.equal(isUsableSourceRect({ x: 10, y: 790, width: 100, height: 100 }, SCREEN), false);
  // выглядывает больше четверти
  assert.equal(isUsableSourceRect({ x: 10, y: 700, width: 100, height: 100 }, SCREEN), true);
}

// --- fallbackTarget ---
{
  const cur = { translateX: 12, translateY: 40, scale: 0.9 };
  const down = fallbackTarget(cur, 1, SCREEN);
  assert.ok(down.translateY > cur.translateY, 'вниз → дальше вниз');
  assert.ok(down.scale < cur.scale);
  assert.equal(down.translateX, 12);
  const up = fallbackTarget({ ...cur, translateY: -40 }, -1, SCREEN);
  assert.ok(up.translateY < -40, 'вверх → дальше вверх');
  // направление 0 трактуем как «вниз»
  assert.ok(fallbackTarget(cur, 0, SCREEN).translateY > cur.translateY);
}

// --- transformedRect: рамка фото в текущем положении ---
{
  const fit: Rect = containFitRect({ width: 1000, height: 1000 }, SCREEN); // 400x400, y=200
  // тождественное преобразование не меняет рамку
  assert.deepEqual(transformedRect(fit, { translateX: 0, translateY: 0, scale: 1 }, SCREEN), fit);

  // оттянули вниз на 100 и уменьшили до 0.5 — рамка вдвое меньше, центр сдвинут на 100
  const moved = transformedRect(fit, { translateX: 0, translateY: 100, scale: 0.5 }, SCREEN);
  near(moved.width, 200);
  near(moved.height, 200);
  near(moved.x + moved.width / 2, SCREEN.width / 2);
  near(moved.y + moved.height / 2, SCREEN.height / 2 + 100);

  // совпадает с применением трансформации к центру и к углам
  const t = { translateX: 30, translateY: -40, scale: 0.8 };
  const r = transformedRect(fit, t, SCREEN);
  const c = applyTransform({ x: fit.x + fit.width / 2, y: fit.y + fit.height / 2 }, t, SCREEN);
  near(r.x + r.width / 2, c.x);
  near(r.y + r.height / 2, c.y);
}

// --- рамка, летящая на миниатюру, не вылезает за неё ---
{
  const fit: Rect = containFitRect({ width: 2000, height: 1000 }, SCREEN); // широкое фото
  const tile: Rect = { x: 20, y: 100, width: 120, height: 120 }; // квадратная плитка
  const t = heroTarget(tile, fit, SCREEN);
  const landed = transformedRect(fit, t, SCREEN);
  // фото покрывает плитку целиком (cover), центры совпадают
  assert.ok(landed.width >= tile.width - 1e-6 && landed.height >= tile.height - 1e-6);
  near(landed.x + landed.width / 2, tile.x + tile.width / 2);
  near(landed.y + landed.height / 2, tile.y + tile.height / 2);
  // но рамка, которую рисует оверлей на финише, — ровно плитка (его не нужно масштабировать целиком)
  const frameAtEnd: Rect = { ...tile };
  assert.deepEqual(frameAtEnd, tile);
}

// --- heroFrameContentFit ---
{
  assert.equal(heroFrameContentFit({ width: 800, height: 600 }), 'cover');
  assert.equal(heroFrameContentFit(null), 'contain');
  assert.equal(heroFrameContentFit(undefined), 'contain');
  assert.equal(heroFrameContentFit({ width: 0, height: 600 }), 'contain');
}

console.log('heroDismissCore.test.ts: ok');
