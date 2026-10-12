import assert from 'node:assert/strict';
import {
  __resetMediaThumbRegistryForTests,
  measureMediaThumb,
  measureThumbRef,
  registerMediaThumb,
  unregisterMediaThumb,
  type MeasurableThumb,
} from './mediaThumbRegistry';

const fake = (x: number, y: number, w: number, h: number): MeasurableThumb => ({
  measureInWindow: (cb) => cb(x, y, w, h),
});

async function main() {
  __resetMediaThumbRegistryForTests();

  // незарегистрированный / пустой id → null
  assert.equal(await measureMediaThumb('nope'), null);
  assert.equal(await measureMediaThumb(''), null);
  assert.equal(await measureMediaThumb(undefined), null);

  // зарегистрированный → прямоугольник
  const a = fake(10, 20, 100, 100);
  registerMediaThumb('a', a);
  assert.deepEqual(await measureMediaThumb('a'), { x: 10, y: 20, width: 100, height: 100 });

  // повторная регистрация заменяет
  registerMediaThumb('a', fake(1, 2, 3, 4));
  assert.deepEqual(await measureMediaThumb('a'), { x: 1, y: 2, width: 3, height: 4 });

  // снятие через null
  registerMediaThumb('a', null);
  assert.equal(await measureMediaThumb('a'), null);

  // unregister не трогает чужой ref (ячейку уже переиспользовали под тот же id)
  const old = fake(0, 0, 10, 10);
  const fresh = fake(5, 5, 20, 20);
  registerMediaThumb('b', old);
  registerMediaThumb('b', fresh);
  unregisterMediaThumb('b', old);
  assert.deepEqual(await measureMediaThumb('b'), { x: 5, y: 5, width: 20, height: 20 });
  unregisterMediaThumb('b', fresh);
  assert.equal(await measureMediaThumb('b'), null);

  // нулевой/битый размер → null
  assert.equal(await measureThumbRef(fake(0, 0, 0, 0)), null);
  assert.equal(await measureThumbRef(fake(0, 0, NaN, 10)), null);
  assert.equal(await measureThumbRef(null), null);

  // measureInWindow бросает → null
  const throwing: MeasurableThumb = {
    measureInWindow: () => {
      throw new Error('boom');
    },
  };
  assert.equal(await measureThumbRef(throwing), null);

  // measureInWindow не отвечает → по таймауту null
  const silent: MeasurableThumb = { measureInWindow: () => {} };
  const started = Date.now();
  assert.equal(await measureThumbRef(silent, 30), null);
  assert.ok(Date.now() - started < 500, 'таймаут сработал быстро');

  // поздний ответ после таймаута не ломает результат
  let late: (() => void) | null = null;
  const slow: MeasurableThumb = {
    measureInWindow: (cb) => {
      late = () => cb(1, 1, 1, 1);
    },
  };
  assert.equal(await measureThumbRef(slow, 20), null);
  (late as (() => void) | null)?.();

  console.log('mediaThumbRegistry.test.ts: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
