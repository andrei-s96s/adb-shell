import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeGridLayout } from '../main/screenMirror/mirrorGridLayout';

const screen = { x: 0, y: 0, width: 1440, height: 900 };

test('empty count produces no tiles', () => {
  assert.deepEqual(computeGridLayout(0, screen), []);
});

test('single device gets the full screen', () => {
  const rects = computeGridLayout(1, screen);
  assert.deepEqual(rects, [{ x: 0, y: 0, width: 1440, height: 900 }]);
});

test('two devices split into a 2x1 row', () => {
  const rects = computeGridLayout(2, screen);
  assert.equal(rects.length, 2);
  assert.equal(rects[0].width, 720);
  assert.equal(rects[1].x, 720);
  assert.equal(rects[0].y, rects[1].y);
});

test('three devices use a 2x2 grid (one empty slot conceptually)', () => {
  const rects = computeGridLayout(3, screen);
  assert.equal(rects.length, 3);
  // cols = ceil(sqrt(3)) = 2, rows = ceil(3/2) = 2
  assert.equal(rects[0].width, 720);
  assert.equal(rects[0].height, 450);
  assert.equal(rects[2].y, 450); // third tile starts the second row
  assert.equal(rects[2].x, 0);
});

test('tile origin offsets by the screen origin, not just size', () => {
  const rects = computeGridLayout(1, { x: 100, y: 50, width: 800, height: 600 });
  assert.deepEqual(rects, [{ x: 100, y: 50, width: 800, height: 600 }]);
});
