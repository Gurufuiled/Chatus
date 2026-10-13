import assert from 'node:assert/strict';
import { createHistoryLoadGuard } from './historyLoadGuard';

// ── начальное состояние ──
{
  const g = createHistoryLoadGuard();
  assert.equal(g.generation(), 0);
  assert.equal(g.isLoadingOlder(), false);
  assert.equal(g.isStale(0), false);
}

// ── подгрузка старых: один раз за раз ──
{
  const g = createHistoryLoadGuard();
  const gen = g.generation();
  assert.equal(g.tryBeginOlder(), true);
  assert.equal(g.isLoadingOlder(), true);
  assert.equal(g.tryBeginOlder(), false, 'пока идёт — вторая не стартует (двойной onEndReached)');
  g.endOlder(gen);
  assert.equal(g.isLoadingOlder(), false);
  assert.equal(g.tryBeginOlder(), true, 'после завершения можно снова');
}

// ── reset: загрузки устаревают, флаг сброшен ──
{
  const g = createHistoryLoadGuard();
  const oldGen = g.generation();
  g.tryBeginOlder();
  g.reset();
  assert.equal(g.isStale(oldGen), true);
  assert.equal(g.isStale(g.generation()), false);
  assert.equal(g.isLoadingOlder(), false);
}

// ── регрессия: смена чата посреди подгрузки не блокирует подгрузку в новом чате ──
{
  const g = createHistoryLoadGuard();
  const chatAGen = g.generation();
  assert.equal(g.tryBeginOlder(), true); // в чате A пошла подгрузка старых

  g.reset(); // пользователь переключился на чат B

  // В новом чате скролл вверх обязан начинать подгрузку (раньше флаг оставался взведённым навсегда)
  assert.equal(g.tryBeginOlder(), true);
  const chatBGen = g.generation();

  // устаревшая загрузка чата A наконец завершилась — её завершение не должно сбросить флаг загрузки чата B
  g.endOlder(chatAGen);
  assert.equal(g.isLoadingOlder(), true, 'флаг принадлежит загрузке чата B');
  assert.equal(g.tryBeginOlder(), false, 'вторая подгрузка в чате B по-прежнему не стартует');

  g.endOlder(chatBGen);
  assert.equal(g.isLoadingOlder(), false);
}

// ── несколько смен подряд ──
{
  const g = createHistoryLoadGuard();
  const gens: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    g.reset();
    gens.push(g.generation());
  }
  assert.deepEqual(gens, [1, 2, 3, 4, 5]);
  for (const old of gens.slice(0, -1)) assert.equal(g.isStale(old), true);
  assert.equal(g.isStale(gens[4]), false);
}

// ── endOlder без начатой подгрузки безопасен ──
{
  const g = createHistoryLoadGuard();
  assert.doesNotThrow(() => g.endOlder(g.generation()));
  assert.equal(g.isLoadingOlder(), false);
}

console.log('historyLoadGuard.test.ts: ok');
