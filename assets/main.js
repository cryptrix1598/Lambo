/* PartsGeek concept — scrub engine + page choreography */
(function () {
  'use strict';

  var VIDEO_URL = 'assets/hero-scrub.mp4';
  var VIDEO_BYTES = 8179325;

  var stage = document.querySelector('.stage');
  var video = document.getElementById('heroVideo');
  var ring = document.querySelector('.ring');
  var posterLayer = document.querySelector('.poster');
  var hero = document.querySelector('.hero');
  var bands = Array.prototype.slice.call(document.querySelectorAll('.band'));
  var hudLabel = document.getElementById('hudLabel');

  /* ---------- seeded rng for identical splits every load ---------- */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ---------- split headlines into word/char spans ---------- */
  bands.forEach(function (band, bi) {
    var r = rng(1000 + bi * 77);
    band.querySelectorAll('[data-split]').forEach(function (el) {
      var mode = el.getAttribute('data-mode') === 'chars' ? 'c' : 'w';
      var spans = [];
      (function walk(node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (child) {
          if (child.nodeType === 3) {
            var frag = document.createDocumentFragment();
            child.textContent.split(/(\s+)/).forEach(function (part) {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
              var sp = document.createElement('span');
              sp.className = mode;
              sp.textContent = part;
              frag.appendChild(sp);
              spans.push(sp);
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === 1 && child.tagName !== 'BR') {
            walk(child);
          }
        });
      })(el);

      var n = spans.length;
      spans.forEach(function (sp, i) {
        if (mode === 'w') {
          sp.style.setProperty('--th', (i / n * 0.35 + r() * 0.05).toFixed(3));
        } else {
          sp.style.setProperty('--th', (r() * 0.55).toFixed(3));
          sp.style.setProperty('--jx', ((r() * 80 - 40)).toFixed(1) + 'px');
          sp.style.setProperty('--jy', ((r() * 60 - 30)).toFixed(1) + 'px');
          sp.style.setProperty('--jr', ((r() * 24 - 12)).toFixed(1) + 'deg');
        }
      });
    });
  });

  /* ---------- band math ---------- */
  bands.forEach(function (b, i) {
    b.a = parseFloat(b.getAttribute('data-a'));
    b.b = parseFloat(b.getAttribute('data-b'));
    b.first = i === 0;
    b.last = i === bands.length - 1;
    b.opCache = -1;
    b.kCache = -1;
  });

  function smoothstep(p, e0, e1) {
    var t = Math.min(1, Math.max(0, (p - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  /* ---------- scrub state ---------- */
  var target = 0, shown = 0, rafId = null, lastTick = 0;
  var seekBusy = false, pendingTime = null;
  var heroOnScreen = true;
  var loadK = 0, loadStart = 0;

  function heroProgress() {
    var range = hero.offsetHeight - window.innerHeight;
    return clamp(window.scrollY / Math.max(1, range), 0, 1);
  }

  function requestSeek(t) {
    if (!video.duration) return;
    if (seekBusy) { pendingTime = t; return; }
    seekBusy = true;
    try { video.currentTime = t; } catch (e) { seekBusy = false; }
  }
  video.addEventListener('seeked', function () {
    seekBusy = false;
    if (pendingTime !== null) {
      var t = pendingTime; pendingTime = null;
      requestSeek(t);
    }
  });
  video.addEventListener('error', function () {
    seekBusy = false; pendingTime = null;
  });

  function updateCaptions(p) {
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i];
      var f = Math.min(0.02, (b.b - b.a) / 3);
      var opIn = b.first ? 1 : smoothstep(p, b.a, b.a + f);
      var opOut = b.last ? 1 : 1 - smoothstep(p, b.b - f, b.b);
      var op = opIn * opOut;
      var ramp = Math.min(0.025, (b.b - b.a) * 0.35);
      var k = clamp((p - b.a) / ramp, 0, 1);
      if (b.first) k = Math.max(k, loadK);

      if (Math.abs(op - b.opCache) > 0.008 || (op === 0) !== (b.opCache === 0)) {
        b.opCache = op;
        b.style.opacity = op.toFixed(3);
      }
      if (Math.abs(k - b.kCache) > 0.008) {
        b.kCache = k;
        b.style.setProperty('--k', k.toFixed(3));
      }
    }

    /* HUD label, ~10Hz and only on change */
    var now = performance.now();
    if (!updateCaptions.lastAt || now - updateCaptions.lastAt > 100) {
      updateCaptions.lastAt = now;
      var label = p < 0.18 ? 'HOOD' : p < 0.40 ? 'LIFT' : p < 0.85 ? 'EXPLODE' : 'FIND YOUR PART';
      if (label !== updateCaptions.lastLabel) {
        updateCaptions.lastLabel = label;
        hudLabel.textContent = label;
      }
    }
  }

  function tick(now) {
    var dt = Math.min(100, now - (lastTick || now));
    lastTick = now;
    var k = 0.16;
    shown += (target - shown) * (1 - Math.pow(1 - k, dt / 16.667));
    if (Math.abs(target - shown) < 0.0005) {
      shown = target;
      rafId = null;
      lastTick = 0;
    } else {
      rafId = requestAnimationFrame(tick);
    }
    requestSeek(shown * (video.duration || 0));
    updateCaptions(shown);
  }

  function onScroll() {
    target = heroProgress();
    if (rafId === null && heroOnScreen) rafId = requestAnimationFrame(tick);
  }

  /* ---------- blob loader with streamed progress ring ---------- */
  var started = false;
  function startBlobFetch() {
    if (started) return;
    started = true;
    stage.classList.add('loading');
    loadHeroBlob().catch(failVideo);
  }

  posterLayer.style.backgroundImage = "url('assets/hero-poster.jpg')";
  var posterImg = new Image();
  posterImg.onload = startBlobFetch;
  posterImg.onerror = startBlobFetch;
  posterImg.src = 'assets/hero-poster.jpg';
  setTimeout(startBlobFetch, 4000);

  async function loadHeroBlob() {
    var ctrl = new AbortController();
    var watchdog = setTimeout(function () { ctrl.abort(); }, 20000);
    var res = await fetch(VIDEO_URL, { priority: 'low', signal: ctrl.signal });
    if (!res.ok) throw new Error('bad response');
    var total = Number(res.headers.get('Content-Length')) || VIDEO_BYTES;
    var reader = res.body.getReader();
    var chunks = [];
    var got = 0, lastRing = 0;
    for (;;) {
      var step = await reader.read();
      if (step.done) break;
      clearTimeout(watchdog);
      watchdog = setTimeout(function () { ctrl.abort(); }, 20000);
      chunks.push(step.value);
      got += step.value.length;
      var frac = Math.min(1, got / total);
      var now = performance.now();
      if (now - lastRing > 100 || frac === 1) {
        lastRing = now;
        ring.style.setProperty('--ld', String(Math.round(126 * (1 - frac))));
      }
    }
    clearTimeout(watchdog);
    ring.style.setProperty('--ld', '0');
    video.src = URL.createObjectURL(new Blob(chunks));
    video.load();
    video.addEventListener('canplay', function () {
      requestSeek(heroProgress() * video.duration);
      stage.classList.add('video-ready');
      stage.classList.remove('loading');
    }, { once: true });
  }

  function makeScrollChevron() {
    var d = document.createElement('div');
    d.className = 'cue';
    d.innerHTML = '<svg width="26" height="14" viewBox="0 0 26 14" fill="none"><path d="M2 2l11 9L24 2" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    return d;
  }
  function failVideo() {
    stage.classList.remove('loading');
    if (ring.parentNode) ring.replaceWith(makeScrollChevron());
    stage.classList.add('video-failed');
  }

  /* ---------- reveal choreography ---------- */
  var revealEls = document.querySelectorAll('[data-reveal]');
  var seen = new WeakSet();
  var revObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting || seen.has(en.target)) return;
      seen.add(en.target);
      en.target.classList.add('in');
      setTimeout(function () { en.target.classList.add('done'); }, 1400);
      revObs.unobserve(en.target);
    });
  }, { threshold: 0.18 });
  revealEls.forEach(function (el) { revObs.observe(el); });

  /* ---------- the one interactive moment: press-and-hold explode ---------- */
  var boomStage = document.getElementById('boomStage');
  var boomBtn = document.getElementById('boomBtn');
  var boomBarFill = document.getElementById('boomBarFill');
  var boomDone = document.getElementById('boomDone');
  var layers = boomStage ? boomStage.querySelectorAll('.layer') : [];
  var P = 0, holding = false, doneLatch = false, boomRaf = null, lastBoomT = 0;

  function paintBoom() {
    boomStage.style.setProperty('--p', P.toFixed(3));
    boomBarFill.parentElement.style.setProperty('--p', P.toFixed(3));
    layers.forEach(function (g) {
      var i = parseFloat(g.style.getPropertyValue('--i')) || 0;
      g.style.transform = 'translateY(' + ((i - 2.5) * 110 * P).toFixed(1) + 'px)';
    });
  }
  function boomTick(now) {
    var dt = Math.min(50, now - (lastBoomT || now)) / 1000;
    lastBoomT = now;
    if (holding && !doneLatch) {
      P += dt * 0.9;
      if (P >= 1) { P = 1; completeBoom(); }
    } else if (!doneLatch) {
      P -= dt * 2.2;
      if (P <= 0) { P = 0; boomRaf = null; paintBoom(); return; }
    }
    paintBoom();
    if (boomRaf !== null) boomRaf = requestAnimationFrame(boomTick);
  }
  function startHold(e) {
    if (e) e.preventDefault();
    if (doneLatch) return;
    holding = true;
    boomStage.classList.add('exploding');
    if (boomRaf === null) { lastBoomT = performance.now(); boomRaf = requestAnimationFrame(boomTick); }
  }
  function endHold() {
    holding = false;
    boomStage.classList.remove('exploding');
  }
  function completeBoom() {
    doneLatch = true;
    endHold();
    boomStage.classList.add('done');
    boomBtn.hidden = true;
    boomDone.hidden = false;
  }
  if (boomBtn && !document.body.classList.contains('rm')) {
    boomBtn.addEventListener('pointerdown', startHold);
    addEventListener('pointerup', endHold);
    addEventListener('pointercancel', endHold);
    boomBtn.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') startHold(e);
    });
    boomBtn.addEventListener('keyup', function (e) {
      if (e.key === ' ' || e.key === 'Enter') endHold();
    });
  }

  /* ---------- finder demo ---------- */
  var YEARS = []; for (var y = 2026; y >= 1995; y--) YEARS.push(String(y));
  var MAKES = {
    Ford: ['F-150', 'Explorer', 'Mustang', 'Escape', 'Fusion'],
    Chevrolet: ['Silverado 1500', 'Equinox', 'Malibu', 'Camaro', 'Impala'],
    Honda: ['Civic', 'Accord', 'CR-V', 'Pilot', 'Odyssey'],
    Toyota: ['Camry', 'Corolla', 'RAV4', 'Tacoma', 'Highlander'],
    Jeep: ['Wrangler', 'Grand Cherokee', 'Cherokee'],
    Subaru: ['Outback', 'Forester', 'Impreza'],
    Nissan: ['Altima', 'Sentra', 'Rogue']
  };
  var fYear = document.getElementById('fYear');
  var fMake = document.getElementById('fMake');
  var fModel = document.getElementById('fModel');
  var finderForm = document.getElementById('finderForm');
  var finderResult = document.getElementById('finderResult');
  var resName = document.getElementById('resName');

  if (fYear) {
    YEARS.forEach(function (v) { fYear.add(new Option(v, v)); });
    Object.keys(MAKES).forEach(function (m) { fMake.add(new Option(m, m)); });
    fillModels();
    fMake.addEventListener('change', fillModels);
    finderForm.addEventListener('submit', function (e) {
      e.preventDefault();
      resName.textContent = fYear.value + ' ' + fMake.value + ' ' + fModel.value;
      finderResult.hidden = false;
      finderResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
  function fillModels() {
    fModel.innerHTML = '';
    (MAKES[fMake.value] || []).forEach(function (m) { fModel.add(new Option(m, m)); });
  }

  /* ---------- pause everything on hidden tabs ---------- */
  document.addEventListener('visibilitychange', function () {
    document.body.classList.toggle('paused', document.hidden);
  });
  var styleEl = document.createElement('style');
  styleEl.textContent = 'body.paused *,body.paused *::before,body.paused *::after{animation-play-state:paused!important}';
  document.head.appendChild(styleEl);

  /* ---------- reduced motion, both directions ---------- */
  function pinToFinalStates() {
    document.body.classList.add('rm');
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    revealEls.forEach(function (el) { el.classList.add('in'); el.classList.add('done'); });
    P = 1; doneLatch = true; paintBoom();
    if (boomStage) boomStage.classList.add('done');
    if (boomBtn) boomBtn.hidden = true;
    if (boomDone) boomDone.hidden = false;
  }
  function unpinFinalStates() {
    document.body.classList.remove('rm');
    revealEls.forEach(function (el) { el.classList.remove('in'); el.classList.remove('done'); });
    seen = new WeakSet();
    revealEls.forEach(function (el) { revObs.observe(el); });
    P = 0; doneLatch = false; paintBoom();
    if (boomStage) boomStage.classList.remove('done');
    if (boomBtn) boomBtn.hidden = false;
    if (boomDone) boomDone.hidden = true;
  }
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) {
    if (e.matches) pinToFinalStates();
    else { unpinFinalStates(); applyHeroMode(); }
  });

  /* ---------- the five static-hero gates, live in both directions ---------- */
  var GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)'
  ];
  var scrubOn = false;
  function initHeroOnce() {
    if (initHeroOnce.done) return;
    initHeroOnce.done = true;
  }
  function enableScrub() {
    if (scrubOn) return;
    scrubOn = true;
    initHeroOnce();
    addEventListener('scroll', onScroll, { passive: true });
    bands.forEach(function (b) { b.opCache = -1; b.kCache = -1; });
    loadStart = performance.now();
    updateCaptions(heroProgress());
    onScroll();
  }
  function disableScrub() {
    if (!scrubOn) return;
    scrubOn = false;
    removeEventListener('scroll', onScroll);
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }
  function applyHeroMode() {
    var gated = GATES.some(function (q) { return matchMedia(q).matches; });
    if (gated) disableScrub();
    else enableScrub();
  }
  var MQLS = GATES.map(function (q) { return matchMedia(q); });
  MQLS.forEach(function (m) { m.addEventListener('change', applyHeroMode); });
  applyHeroMode();

  /* band-one load ramp */
  (function loadRamp() {
    var t0 = performance.now();
    (function step(now) {
      var t = clamp((now - t0) / 900, 0, 1);
      loadK = t * t * (3 - 2 * t);
      if (scrubOn) updateCaptions(heroProgress());
      if (t < 1) requestAnimationFrame(step);
    })(t0);
  })();

  /* hero on-screen gate for the rAF loop + cue life */
  new IntersectionObserver(function (entries) {
    heroOnScreen = entries[0].isIntersecting;
    stage.classList.toggle('live', heroOnScreen);
    if (heroOnScreen && scrubOn && rafId === null) rafId = requestAnimationFrame(tick);
  }, { threshold: 0 }).observe(stage);

  /* flick test harness: flick(120,12); flick(240,8); flick(360,6) from the top */
  window.flick = async function (stepSize, count) {
    for (var i = 0; i < count; i++) {
      window.scrollBy(0, stepSize);
      await new Promise(function (r) { setTimeout(r, 400); });
      var st = bands.map(function (b, n) { return n + ':' + getComputedStyle(b).opacity; }).join('  ');
      console.log('y=' + Math.round(scrollY), st);
    }
  };
})();
