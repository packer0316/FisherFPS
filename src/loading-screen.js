// Loading screen: the first load and every BOSS arena wait behind a progress bar until
// everything the player will see or hear is ready.
//
// three.js loaders report each file to a LoadingManager, including textures that a module
// starts without awaiting. Counting those items means a scene only counts as loaded once
// its last texture has arrived, not merely once the awaited models have.

/**
 * Count LoadingManager items from now on. Items already open before this call are ignored,
 * so their completion can never push the finished count past the started count.
 */
export function trackLoaderItems(manager) {
  const open = new Map(), waiters = new Set();
  let started = 0, ended = 0;
  const start = manager.itemStart, end = manager.itemEnd;
  manager.itemStart = function (url) {
    started++;
    open.set(url, (open.get(url) ?? 0) + 1);
    return start.call(this, url);
  };
  manager.itemEnd = function (url) {
    const count = open.get(url);
    if (count) {
      if (count === 1) open.delete(url);
      else open.set(url, count - 1);
      ended++;
    }
    const result = end.call(this, url);
    if (started === ended) for (const wake of [...waiters]) wake();
    return result;
  };
  return {
    /** Returns a reader for the share of items finished since this call (0 until one starts). */
    mark() {
      const base = ended;
      return () => (started === base ? 0 : (ended - base) / (started - base));
    },
    /**
     * Resolves once no item is open. It checks again a moment later, because a finished
     * load can start the next one from its callback.
     */
    idle(settle = 40) {
      return new Promise((resolve) => {
        const check = () => {
          if (started !== ended) { waiters.add(check); return; }
          waiters.delete(check);
          setTimeout(() => (started === ended ? resolve() : check()), settle);
        };
        check();
      });
    },
  };
}

/**
 * A weighted set of parts; overall progress is the weighted mean of the parts' progress.
 * Register every part before the first frame so the total weight stays fixed.
 */
export function makeLoadJob(items) {
  const parts = [];
  return {
    /** Share of loader items finished since the job began. */
    loaderProgress: items.mark(),
    loaderIdle: () => items.idle(),
    part(label, weight, read = () => 0) {
      const part = { label, weight, read, done: false };
      parts.push(part);
      const finish = () => { part.done = true; };
      return {
        done: finish,
        /** Marks the part done when the promise settles; returns the promise unchanged. */
        follow(promise) { promise.then(finish, finish); return promise; },
      };
    },
    progress() {
      let total = 0, sum = 0;
      for (const p of parts) {
        total += p.weight;
        sum += p.weight * (p.done ? 1 : Math.min(1, Math.max(0, Number(p.read()) || 0)));
      }
      return total ? sum / total : 0;
    },
    /** Label of the first unfinished part, shown under the bar. */
    step() { return parts.find((p) => !p.done)?.label ?? ''; },
  };
}

/** Drives the #loading overlay. Only one job runs at a time. */
export function makeLoadingScreen(items, doc = document) {
  const $ = (id) => doc.getElementById(id);
  const root = $('loading'), title = $('load-msg'), bar = $('load-bar'), fill = $('load-fill'),
    percent = $('load-percent'), step = $('load-step');
  let job = null, shown = 0, frame = 0;

  function paint(value, label) {
    const pct = Math.floor(value * 100);
    fill.style.transform = `scaleX(${value})`;
    percent.textContent = pct + '%';
    bar.setAttribute('aria-valuenow', String(pct));
    if (step.textContent !== label) step.textContent = label;
  }
  function render() {
    frame = 0;
    if (!job) return;
    // Ease toward the target, but never move backwards when more files are discovered.
    shown = Math.max(shown, shown + (job.progress() - shown) * 0.2);
    paint(shown, job.step());
    frame = requestAnimationFrame(render);
  }
  function stop() {
    job = null;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  return {
    get active() { return !!job; },
    /** Shows the overlay and returns a job; the overlay stays up until finish() or cancel(). */
    begin(text) {
      stop();
      const current = makeLoadJob(items);
      job = current;
      shown = 0;
      root.classList.remove('failed');
      title.textContent = text;
      paint(0, '');
      root.hidden = false;
      frame = requestAnimationFrame(render);
      const close = () => { if (job !== current) return; stop(); root.hidden = true; };
      return Object.assign(current, { finish: close, cancel: close });
    },
    /** Keeps the overlay up with an error in place of the bar. */
    fail(message) {
      stop();
      root.classList.add('failed');
      title.textContent = message;
      step.textContent = '';
      root.hidden = false;
    },
  };
}

/** Fonts, <img> elements and CSS background images, so menus never open half-drawn. */
export function preloadInterface(doc = document, win = globalThis) {
  let total = 0, loaded = 0;
  const kept = [];
  const ready = (async () => {
    // The load event comes after every stylesheet and <img> in the page, so all rules are readable.
    if (doc.readyState !== 'complete') await new Promise((r) => win.addEventListener('load', r, { once: true }));
    const tasks = [];
    doc.fonts?.forEach((face) => tasks.push(face.load()));
    for (const img of doc.images) if (img.getAttribute('src')) tasks.push(img.decode());
    for (const url of cssImages(doc)) {
      const img = new Image();
      img.src = url;
      kept.push(img);
      tasks.push(img.decode());
    }
    total = tasks.length;
    await Promise.all(tasks.map((task) => task.catch(() => {}).finally(() => { loaded++; })));
  })();
  return { ready, progress: () => (total ? loaded / total : 0) };
}

function cssImages(doc) {
  const urls = new Set();
  const visit = (rules, base) => {
    for (const rule of rules) {
      if (rule.cssRules) visit(rule.cssRules, base);
      // Style rules only: @font-face sources load through document.fonts instead.
      if (!rule.selectorText) continue;
      for (const [, , url] of rule.style.cssText.matchAll(/url\((['"]?)(.*?)\1\)/g)) {
        if (!/^(data|blob):/i.test(url)) urls.add(new URL(url, base).href);
      }
    }
  };
  for (const sheet of doc.styleSheets) {
    try { visit(sheet.cssRules, sheet.href ?? doc.baseURI); } catch { /* unreadable cross-origin sheet */ }
  }
  return urls;
}
