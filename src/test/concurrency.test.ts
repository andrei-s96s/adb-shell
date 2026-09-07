import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency } from '../main/util/concurrency';

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

test('results are returned in item order, not completion order', async () => {
  const order: number[] = [];
  const results = await mapWithConcurrency([30, 10, 20], 3, async (ms, index) => {
    await new Promise((r) => setTimeout(r, ms));
    order.push(index);
    return ms;
  });
  assert.deepEqual(results, [30, 10, 20]);
  // Внутренние по времени задержки завершились в другом порядке (20мс до 30мс) —
  // подтверждает, что результаты выровнены по индексу, а не по завершению.
  assert.deepEqual(order, [1, 2, 0]);
});

test('never runs more than `limit` items concurrently', async () => {
  let active = 0;
  let maxActive = 0;
  const gates = Array.from({ length: 6 }, () => deferred<void>());
  const runPromise = mapWithConcurrency(gates, 2, async (gate) => {
    active++;
    maxActive = Math.max(maxActive, active);
    await gate.promise;
    active--;
  });
  // Даём микрозадачам стартовать первую волну воркеров.
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(maxActive, 2);
  for (const g of gates) g.resolve();
  await runPromise;
});

test('an empty items array resolves to an empty array without spawning workers', async () => {
  let calls = 0;
  const results = await mapWithConcurrency([], 4, async () => {
    calls++;
    return 1;
  });
  assert.deepEqual(results, []);
  assert.equal(calls, 0);
});

test('limit larger than items.length does not spawn extra idle workers', async () => {
  let concurrentCalls = 0;
  let maxConcurrentCalls = 0;
  await mapWithConcurrency([1, 2], 10, async (n) => {
    concurrentCalls++;
    maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
    await new Promise((r) => setTimeout(r, 5));
    concurrentCalls--;
    return n;
  });
  assert.equal(maxConcurrentCalls, 2);
});

test('a rejection from fn propagates out of mapWithConcurrency', async () => {
  await assert.rejects(
    mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    }),
    /boom/
  );
});

test('processes all items exactly once even when limit is 1 (fully sequential)', async () => {
  const seen: number[] = [];
  const results = await mapWithConcurrency([1, 2, 3, 4], 1, async (n) => {
    seen.push(n);
    return n * 2;
  });
  assert.deepEqual(seen, [1, 2, 3, 4]);
  assert.deepEqual(results, [2, 4, 6, 8]);
});
