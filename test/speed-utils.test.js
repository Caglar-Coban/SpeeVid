const test = require('node:test');
const assert = require('node:assert/strict');
const { clampSpeed, formatSpeed, formatDuration, PRESETS, SPEED_MIN, SPEED_MAX } = require('../src/shared/speed-utils.js');

test('clampSpeed keeps values within bounds', () => {
  assert.equal(clampSpeed(0.05), SPEED_MIN);
  assert.equal(clampSpeed(20), SPEED_MAX);
  assert.equal(clampSpeed(1.5), 1.5);
});

test('clampSpeed rounds to two decimals', () => {
  assert.equal(clampSpeed(1.23456), 1.23);
});

test('clampSpeed falls back to 1 for non-numeric input', () => {
  assert.equal(clampSpeed('abc'), 1);
});

test('formatSpeed strips trailing zeros', () => {
  assert.equal(formatSpeed(1), '1x');
  assert.equal(formatSpeed(1.5), '1.5x');
  assert.equal(formatSpeed(1.25), '1.25x');
});

test('PRESETS is sorted, non-empty, and within bounds', () => {
  assert.ok(PRESETS.length > 0);
  const sorted = [...PRESETS].sort((a, b) => a - b);
  assert.deepEqual(PRESETS, sorted);
  PRESETS.forEach((p) => {
    assert.ok(p >= SPEED_MIN && p <= SPEED_MAX);
  });
});

test('formatDuration splits seconds into whole hours and minutes', () => {
  assert.deepEqual(formatDuration(0), { hours: 0, minutes: 0 });
  assert.deepEqual(formatDuration(59), { hours: 0, minutes: 0 });
  assert.deepEqual(formatDuration(60), { hours: 0, minutes: 1 });
  assert.deepEqual(formatDuration(3600), { hours: 1, minutes: 0 });
  assert.deepEqual(formatDuration(3600 * 2 + 60 * 15 + 59), { hours: 2, minutes: 15 });
});

test('formatDuration clamps negative input to zero', () => {
  assert.deepEqual(formatDuration(-100), { hours: 0, minutes: 0 });
});
