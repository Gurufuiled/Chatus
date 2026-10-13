import assert from 'node:assert/strict';
import {
  SCRUB_SEEK_MIN_DELTA_MS,
  SCRUB_SEEK_MIN_INTERVAL_MS,
  SCRUB_SEEK_TOLERANCE_S,
  applyScrubPlayerMode,
  createScrubSeekScheduler,
  scrubPositionMs,
  type ScrubbablePlayer,
} from './videoNoteScrub';

// ── fake clock ──
function makeClock() {
  let t = 1000;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimer: (h: unknown) => {
      timers.delete(h as number);
    },
    advance(ms: number) {
      const target = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, v]) => v.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        t = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
      }
      t = target;
    },
    pending: () => timers.size,
  };
}

// ── scrubPositionMs ──
assert.equal(scrubPositionMs(0, 5000), 0);
assert.equal(scrubPositionMs(1, 5000), 5000);
assert.equal(scrubPositionMs(0.5, 5000), 2500);
assert.equal(scrubPositionMs(-1, 5000), 0, 'за началом кольца');
assert.equal(scrubPositionMs(2, 5000), 5000, 'за концом кольца');
assert.equal(scrubPositionMs(0.5, 0), 0, 'нулевая длительность');
assert.equal(scrubPositionMs(NaN, 5000), 0);
assert.equal(scrubPositionMs(0.3333, 3000), 1000);

// ── applyScrubPlayerMode ──
{
  const player: ScrubbablePlayer = {};
  applyScrubPlayerMode(player, true);
  assert.deepEqual(player.scrubbingModeOptions, { scrubbingModeEnabled: true });
  assert.deepEqual(player.seekTolerance, {
    toleranceBefore: SCRUB_SEEK_TOLERANCE_S,
    toleranceAfter: SCRUB_SEEK_TOLERANCE_S,
  });
  assert.ok(SCRUB_SEEK_TOLERANCE_S > 0 && SCRUB_SEEK_TOLERANCE_S < 0.5, 'допуск небольшой — кадр рядом, не «слайд-шоу»');

  applyScrubPlayerMode(player, false);
  assert.deepEqual(player.scrubbingModeOptions, { scrubbingModeEnabled: false }, 'после перетаскивания режим выключен');
  assert.deepEqual(player.seekTolerance, { toleranceBefore: 0, toleranceAfter: 0 }, 'точная перемотка при отпускании');
}

// плеер, у которого свойства нельзя установить (старая версия), не ломает перемотку
{
  const broken = {} as ScrubbablePlayer;
  Object.defineProperty(broken, 'seekTolerance', {
    set() {
      throw new Error('not supported');
    },
  });
  Object.defineProperty(broken, 'scrubbingModeOptions', {
    set() {
      throw new Error('not supported');
    },
  });
  assert.doesNotThrow(() => applyScrubPlayerMode(broken, true));
  assert.doesNotThrow(() => applyScrubPlayerMode(broken, false));
}

// ── scheduler: первая перемотка сразу ──
{
  const clock = makeClock();
  const seeks: number[] = [];
  const s = createScrubSeekScheduler({ seek: (ms) => seeks.push(ms), ...clock });
  s.push(500);
  assert.deepEqual(seeks, [500], 'первая позиция — без задержки');
}

// ── частота: не чаще интервала, но последняя позиция не теряется («хвост») ──
{
  const clock = makeClock();
  const seeks: number[] = [];
  const s = createScrubSeekScheduler({ seek: (ms) => seeks.push(ms), ...clock });
  s.push(100);
  clock.advance(10);
  s.push(200);
  clock.advance(10);
  s.push(300);
  assert.deepEqual(seeks, [100], 'слишком рано — откладываем');
  assert.equal(clock.pending(), 1, 'ровно один таймер, а не по таймеру на каждое движение');

  clock.advance(SCRUB_SEEK_MIN_INTERVAL_MS);
  assert.deepEqual(seeks, [100, 300], 'выполнена только последняя позиция (промежуточная 200 не нужна)');
  assert.equal(clock.pending(), 0);
}

// палец остановился сразу после перемотки — «хвост» всё равно доезжает
{
  const clock = makeClock();
  const seeks: number[] = [];
  const s = createScrubSeekScheduler({ seek: (ms) => seeks.push(ms), ...clock });
  s.push(1000);
  clock.advance(5);
  s.push(1500); // последнее движение, дальше палец неподвижен
  clock.advance(1000);
  assert.deepEqual(seeks, [1000, 1500]);
}

// ── после паузы длиннее интервала — снова сразу ──
{
  const clock = makeClock();
  const seeks: number[] = [];
  const s = createScrubSeekScheduler({ seek: (ms) => seeks.push(ms), ...clock });
  s.push(100);
  clock.advance(SCRUB_SEEK_MIN_INTERVAL_MS + 1);
  s.push(900);
  assert.deepEqual(seeks, [100, 900]);
  assert.equal(clock.pending(), 0);
}

// ── ускорение по сравнению со старым ограничением 90 мс ──
{
  const clock = makeClock();
  const seeks: number[] = [];
  const s = createScrubSeekScheduler({ seek: (ms) => seeks.push(ms), ...clock });
  // палец равномерно движется 1 секунду, событие каждые 8 мс
  for (let i = 0; i < 125; i += 1) {
    s.push(i * 20);
    clock.advance(8);
  }
  clock.advance(200);
  assert.ok(seeks.length >= 22, `перемоток за секунду: ${seeks.length} (раньше было не больше ~11)`);
  assert.equal(seeks[seeks.length - 1], 124 * 20, 'последняя позиция выполнена');
  for (let i = 1; i < seeks.length; i += 1) assert.ok(seeks[i] > seeks[i - 1], 'позиции идут по возрастанию');
}

// ── мелкие сдвиги не перематываем ──
{
  const clock = makeClock();
  const seeks: number[] = [];
  const s = createScrubSeekScheduler({ seek: (ms) => seeks.push(ms), ...clock });
  s.push(1000);
  clock.advance(100);
  s.push(1000 + SCRUB_SEEK_MIN_DELTA_MS - 1);
  assert.deepEqual(seeks, [1000], 'кадр всё равно тот же');
  clock.advance(100);
  s.push(1000 + SCRUB_SEEK_MIN_DELTA_MS);
  assert.deepEqual(seeks, [1000, 1000 + SCRUB_SEEK_MIN_DELTA_MS]);
}

// ── cancel: отложенное не выполняется, счёт начинается заново ──
{
  const clock = makeClock();
  const seeks: number[] = [];
  const s = createScrubSeekScheduler({ seek: (ms) => seeks.push(ms), ...clock });
  s.push(100);
  clock.advance(5);
  s.push(200); // отложено
  s.cancel();
  clock.advance(500);
  assert.deepEqual(seeks, [100], 'после cancel «хвост» не выполняется (при отпускании делаем точную перемотку отдельно)');
  assert.equal(clock.pending(), 0);

  // и новое перетаскивание начинается с мгновенной перемотки, даже той же позиции
  s.push(100);
  assert.deepEqual(seeks, [100, 100]);
}

// ── можно настроить интервал ──
{
  const clock = makeClock();
  const seeks: number[] = [];
  const s = createScrubSeekScheduler({ seek: (ms) => seeks.push(ms), minIntervalMs: 200, ...clock });
  s.push(0);
  clock.advance(150);
  s.push(500);
  assert.deepEqual(seeks, [0]);
  clock.advance(50);
  assert.deepEqual(seeks, [0, 500]);
}

console.log('videoNoteScrub.test.ts: ok');
