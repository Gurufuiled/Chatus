import assert from 'node:assert/strict';
import { createCoalesceQueue } from './coalesceQueue';

function makeClock() {
  let t = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
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

// ── события в пределах окна обрабатываются одной пачкой ──
{
  const clock = makeClock();
  const batches: number[][] = [];
  const q = createCoalesceQueue<number>((b) => batches.push(b), 40, clock);
  q.push(1);
  clock.advance(10);
  q.push(2);
  clock.advance(10);
  q.push(3);
  assert.equal(batches.length, 0, 'до конца окна ничего не обрабатывается');
  assert.equal(q.size(), 3);
  assert.equal(clock.pending(), 1, 'один таймер на всю пачку, а не по таймеру на событие');

  clock.advance(20); // 40 мс от первого события
  assert.deepEqual(batches, [[1, 2, 3]]);
  assert.equal(q.size(), 0);
  assert.equal(clock.pending(), 0);
}

// ── окно отсчитывается от ПЕРВОГО события (не растягивается бесконечно потоком) ──
{
  const clock = makeClock();
  const batches: number[][] = [];
  const q = createCoalesceQueue<number>((b) => batches.push(b), 40, clock);
  for (let i = 0; i < 10; i += 1) {
    q.push(i);
    clock.advance(5);
  }
  // за 50 мс непрерывного потока первая пачка уже вышла на 40-й
  assert.ok(batches.length >= 1);
  assert.deepEqual(batches[0], [0, 1, 2, 3, 4, 5, 6, 7]);
}

// ── следующая пачка стартует новым окном ──
{
  const clock = makeClock();
  const batches: string[][] = [];
  const q = createCoalesceQueue<string>((b) => batches.push(b), 30, clock);
  q.push('a');
  clock.advance(30);
  q.push('b');
  q.push('c');
  clock.advance(30);
  assert.deepEqual(batches, [['a'], ['b', 'c']]);
}

// ── flush: обработать сразу и погасить таймер ──
{
  const clock = makeClock();
  const batches: number[][] = [];
  const q = createCoalesceQueue<number>((b) => batches.push(b), 40, clock);
  q.push(1);
  q.push(2);
  q.flush();
  assert.deepEqual(batches, [[1, 2]]);
  assert.equal(clock.pending(), 0);
  clock.advance(100);
  assert.equal(batches.length, 1, 'после flush таймер повторно не срабатывает');
  q.flush(); // пустая очередь — ничего
  assert.equal(batches.length, 1);
}

// ── cancel: накопленное отбрасывается ──
{
  const clock = makeClock();
  const batches: number[][] = [];
  const q = createCoalesceQueue<number>((b) => batches.push(b), 40, clock);
  q.push(1);
  q.cancel();
  assert.equal(q.size(), 0);
  assert.equal(clock.pending(), 0);
  clock.advance(100);
  assert.deepEqual(batches, []);
  // и после cancel очередь работает как раньше
  q.push(2);
  clock.advance(40);
  assert.deepEqual(batches, [[2]]);
}

// ── maxBatchSize: переполнение обрабатывается сразу ──
{
  const clock = makeClock();
  const batches: number[][] = [];
  const q = createCoalesceQueue<number>((b) => batches.push(b), 1000, { ...clock, maxBatchSize: 3 });
  q.push(1);
  q.push(2);
  assert.equal(batches.length, 0);
  q.push(3);
  assert.deepEqual(batches, [[1, 2, 3]], 'при 3 событиях — сразу, не дожидаясь таймера');
  assert.equal(clock.pending(), 0);
}

// ── обработчик может добавлять события (новая пачка) ──
{
  const clock = makeClock();
  const batches: number[][] = [];
  const q = createCoalesceQueue<number>(
    (b) => {
      batches.push(b);
      if (b[0] === 1) q.push(99);
    },
    10,
    clock,
  );
  q.push(1);
  clock.advance(10);
  clock.advance(10);
  assert.deepEqual(batches, [[1], [99]]);
}

// ── реальные таймеры по умолчанию ──
async function realTimers() {
  const batches: number[][] = [];
  const q = createCoalesceQueue<number>((b) => batches.push(b), 5);
  q.push(1);
  q.push(2);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(batches, [[1, 2]]);
}

realTimers().then(
  () => console.log('coalesceQueue.test.ts: ok'),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
