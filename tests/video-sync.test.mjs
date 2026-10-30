import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncVideos } from '../static/video-sync.mjs';

let clock;
globalThis.requestAnimationFrame = callback => { clock = callback; return 1; };
globalThis.cancelAnimationFrame = () => { clock = null; };
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

class Video extends EventTarget {
  paused = true;
  readyState = 4;
  seeking = false;
  duration = 20;
  error = null;
  time = 0;
  rate = 1;
  get currentTime() { return this.time; }
  set currentTime(value) {
    this.time = value;
    this.seeking = true;
    queueMicrotask(() => this.dispatchEvent(new Event('seeking')));
    queueMicrotask(() => { this.seeking = false; this.dispatchEvent(new Event('seeked')); });
  }
  get playbackRate() { return this.rate; }
  set playbackRate(value) { this.rate = value; queueMicrotask(() => this.dispatchEvent(new Event('ratechange'))); }
  play() {
    if (this.paused) { this.paused = false; queueMicrotask(() => this.dispatchEvent(new Event('play'))); }
    return Promise.resolve();
  }
  pause() {
    if (!this.paused) { this.paused = true; queueMicrotask(() => this.dispatchEvent(new Event('pause'))); }
  }
}

test('either player controls play, pause, precise seek and speed without event loops', async () => {
  const left = new Video(), right = new Video();
  const dispose = syncVideos(left, right);
  for (const [source, other] of [[left, right], [right, left]]) {
    await source.play(); await settle();
    assert.equal(other.paused, false);
    source.currentTime = 5.02; await settle();
    assert.equal(other.currentTime, 5.02);
    assert.equal(source.paused, false);
    assert.equal(other.paused, false);
    source.pause(); await settle();
    assert.equal(other.paused, true);
    source.currentTime = 5.05; await settle();
    assert.equal(other.currentTime, 5.05); // A 30ms seek must also propagate.
    assert.equal(source.paused, true);
    assert.equal(other.paused, true);
    source.playbackRate = 1.5; await settle();
    assert.equal(other.playbackRate, 1.5);
  }
  dispose();
  await right.play(); await settle();
  assert.equal(left.paused, true);
  assert.equal(clock, null);
});

test('both wait for decoding and resume together after buffering', async () => {
  const left = new Video(), right = new Video();
  right.readyState = 1;
  const dispose = syncVideos(left, right);
  await left.play(); await settle();
  assert.equal(left.paused, true);
  assert.equal(right.paused, true);
  right.readyState = 4; right.dispatchEvent(new Event('canplay')); await settle();
  assert.equal(left.paused, false);
  assert.equal(right.paused, false);
  right.readyState = 2; right.dispatchEvent(new Event('waiting')); await settle();
  assert.equal(left.paused, true);
  assert.equal(right.paused, true);
  right.readyState = 4; right.dispatchEvent(new Event('canplay')); await settle();
  assert.equal(left.paused, false);
  assert.equal(right.paused, false);
  dispose();
});

test('clock drift is corrected and end of playback stops both', async () => {
  const left = new Video(), right = new Video();
  const dispose = syncVideos(left, right);
  await right.play(); await settle();
  left.time = 4; right.time = 4.2;
  clock(); await settle();
  assert.equal(left.currentTime, right.currentTime);
  assert.equal(left.paused, false);
  assert.equal(right.paused, false);
  right.time = 20; right.paused = true; right.dispatchEvent(new Event('ended')); await settle();
  assert.equal(left.paused, true);
  assert.equal(left.currentTime, 20);
  dispose();
});
