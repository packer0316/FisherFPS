import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { clips } from '../src/audio-manifest.js';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('src/game-audio.js', root), 'utf8');

test('every manifest clip has an encoded file with a sync point inside it', () => {
  for (const [name, [duration, sync]] of Object.entries(clips)) {
    assert.ok(existsSync(new URL('public/audio/' + name + '.mp3', root)), name);
    assert.ok(duration > 0 && sync >= 0 && sync < duration, name);
  }
});

test('clips and variant families used by the game exist in the manifest', () => {
  const families = [...source.matchAll(/variant\('([a-z_/]+)', (\d+)\)/g)];
  assert.ok(families.length > 10);
  for (const [, base, count] of families) {
    for (let i = 1; i <= Number(count); i++) assert.ok(clips[`${base}_${i}`], `${base}_${i}`);
  }
  const bases = new Set(families.map(m => m[1]));
  const literals = [...source.matchAll(/'((?:weapons|impacts|reward|monsters|player|ui|ambience)\/[a-z_0-9]+)'/g)]
    .map(m => m[1]).filter(name => !bases.has(name));
  assert.ok(literals.length > 20);
  for (const name of literals) {
    // A trailing underscore is a prefix the code completes with a variant number.
    const family = Object.keys(clips).some(c => c.startsWith(name.endsWith('_') ? name : name + '_'));
    assert.ok(clips[name] || family, name);
  }
});

test('reload parts land inside the reload and keep the animation order', () => {
  const table = source.slice(source.indexOf('const reloadParts'), source.indexOf('const shots'));
  for (const weapon of ['rifle', 'pistol', 'mg3']) {
    const block = table.slice(table.indexOf(weapon + ':'), table.indexOf('],', table.indexOf(weapon + ':')));
    const stops = [...block.matchAll(/at: ([0-9.]+)/g)].map(m => Number(m[1]));
    assert.ok(stops.length >= 3, weapon);
    assert.deepEqual(stops, [...stops].sort((a, b) => a - b), weapon);
    assert.ok(stops.every(t => t > 0 && t < 1), weapon);
  }
});
