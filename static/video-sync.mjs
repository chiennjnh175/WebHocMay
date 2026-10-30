// Both native players control one shared playback intent. Programmatic events
// arrive asynchronously, so consume their echoes instead of treating them as user input.
export function syncVideos(left, right, onError = () => {}) {
  const videos = [left, right];
  const listeners = [];
  const expected = new Map(videos.map(video => [video, { play: 0, pause: 0, seek: null, pendingTime: null }]));
  let playing = false;
  let disposed = false;
  let leader = left;
  let generation = 0;
  let frameId;

  function listen(video, event, listener) {
    video.addEventListener(event, listener);
    listeners.push([video, event, listener]);
  }

  function consume(video, event) {
    const state = expected.get(video);
    if (!state[event]) return false;
    state[event]--;
    return true;
  }

  function pauseBoth() {
    generation++;
    for (const video of videos) {
      if (!video.paused) {
        expected.get(video).pause++;
        video.pause();
      }
    }
  }

  function seek(video, time) {
    const state = expected.get(video);
    if (!video.readyState) {
      state.pendingTime = time;
      return;
    }
    const end = Number.isFinite(video.duration) ? video.duration : time;
    const target = Math.max(0, Math.min(time, end));
    if (Math.abs(video.currentTime - target) > .001) {
      state.seek = target;
      video.currentTime = target;
    }
  }

  function align(source) {
    const other = source === left ? right : left;
    seek(other, source.currentTime);
  }

  function resume() {
    if (disposed || !playing || videos.some(video => video.seeking || video.readyState < 3 || video.error)) return;
    const version = generation;
    for (const video of videos) {
      if (!video.paused) continue;
      expected.get(video).play++;
      video.play().catch(error => {
        // A deliberate pause/seek invalidates an older pending play promise.
        if (disposed || version !== generation) return;
        playing = false;
        pauseBoth();
        onError("Không phát được đồng thời hai video. Bấm phát để thử lại.");
      });
    }
  }

  for (const video of videos) {
    video.preload = "auto";
    listen(video, "play", () => {
      if (consume(video, "play")) return;
      playing = true;
      leader = video;
      // Wait for both decoders before starting the pair.
      pauseBoth();
      align(video);
      resume();
    });
    listen(video, "pause", () => {
      if (consume(video, "pause")) return;
      playing = false;
      leader = video;
      pauseBoth();
      align(video);
    });
    listen(video, "seeking", () => {
      const state = expected.get(video);
      if (state.seek !== null && Math.abs(video.currentTime - state.seek) < .03) {
        state.seek = null;
        return;
      }
      state.seek = null;
      leader = video;
      pauseBoth();
      align(video);
    });
    listen(video, "seeked", resume);
    listen(video, "loadedmetadata", () => {
      const state = expected.get(video);
      if (state.pendingTime !== null) {
        seek(video, state.pendingTime);
        state.pendingTime = null;
      }
      resume();
    });
    listen(video, "canplay", resume);
    listen(video, "waiting", () => {
      if (!playing || (video.readyState >= 3 && !video.seeking)) return;
      pauseBoth();
      align(leader);
    });
    listen(video, "ratechange", () => {
      const other = video === left ? right : left;
      if (other.playbackRate !== video.playbackRate) other.playbackRate = video.playbackRate;
    });
    listen(video, "ended", () => {
      playing = false;
      pauseBoth();
      align(video);
    });
    listen(video, "error", () => {
      playing = false;
      pauseBoth();
      onError("Không tải được video để so sánh.");
    });
  }

  function checkClock() {
    if (disposed) return;
    if (playing && videos.every(video => !video.paused && !video.seeking && video.readyState >= 3)) {
      if (Math.abs(left.currentTime - right.currentTime) > .06) {
        pauseBoth();
        align(leader);
        resume();
      }
    }
    frameId = requestAnimationFrame(checkClock);
  }
  frameId = requestAnimationFrame(checkClock);

  return () => {
    disposed = true;
    playing = false;
    cancelAnimationFrame(frameId);
    for (const [video, event, listener] of listeners) video.removeEventListener(event, listener);
    pauseBoth();
  };
}
