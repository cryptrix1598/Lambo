/* Charlie's Auto Body Shop — scroll-scrub hero + page choreography */
(function () {
  'use strict';

  var stage = document.querySelector('.stage');
  var video = document.getElementById('heroVideo');
  var heroContent = document.querySelector('.hero-content');

  /* ---------- helpers ---------- */
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function smoothstep(p, e0, e1) {
    var t = Math.min(1, Math.max(0, (p - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  /* ---------- video scroll-scrub ---------- */
  var lastSeekTime = -1;

  function heroProgress() {
    var range = document.documentElement.scrollHeight - window.innerHeight;
    return clamp(window.scrollY / Math.max(1, range), 0, 1);
  }

  function seekVideo(time) {
    if (!video || !video.duration) return;
    var clamped = clamp(time, 0, video.duration - 0.04);
    if (Math.abs(clamped - lastSeekTime) < 0.08) return;
    lastSeekTime = clamped;
    try { video.currentTime = clamped; } catch (e) {}
  }

  function onScroll() {
    var dur = video ? video.duration : 0;
    if (dur > 0) seekVideo(heroProgress() * dur);
    if (heroContent) {
      heroContent.style.transform = 'translateY(' + (-window.scrollY * 0.07).toFixed(1) + 'px)';
    }
  }

  /* native video loading */
  if (stage && video) {
    video.addEventListener('loadeddata', function () {
      seekVideo(heroProgress() * video.duration);
      stage.classList.add('video-ready');
    });
    video.addEventListener('canplay', function () {
      seekVideo(heroProgress() * video.duration);
      stage.classList.add('video-ready');
    });
  }

  /* scroll listener */
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- reveal choreography ---------- */
  var revealEls = document.querySelectorAll('[data-reveal]');
  var seen = new WeakSet();
  var isInnerPage = !!document.querySelector('.page-body');

  if (isInnerPage) {
    /* Inner pages: observe individual .part elements, skip first 3 (load animation) */
    var partEls = document.querySelectorAll('.page-body [data-reveal] .part');
    partEls.forEach(function (el, i) {
      if (i < 3) { seen.add(el); el.classList.add('in'); el.classList.add('done'); }
    });
    var revObs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting || seen.has(en.target)) return;
        seen.add(en.target);
        en.target.classList.add('in');
        setTimeout(function () { en.target.classList.add('done'); }, 1400);
        revObs.unobserve(en.target);
      });
    }, { threshold: 0.15 });
    partEls.forEach(function (el) { if (!seen.has(el)) revObs.observe(el); });
  } else {
    /* Landing page: observe wrappers as before */
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
  }

  /* ---------- press-and-hold explode ---------- */
  var boomStage = document.getElementById('boomStage');
  var boomBtn = document.getElementById('boomBtn');
  var boomBarFill = document.getElementById('boomBarFill');
  var boomDone = document.getElementById('boomDone');
  var layers = boomStage ? boomStage.querySelectorAll('.layer') : [];
  var P = 0, holding = false, doneLatch = false, boomRaf = null, lastBoomT = 0;

  function paintBoom() {
    if (!boomStage) return;
    boomStage.style.setProperty('--p', P.toFixed(3));
    if (boomBarFill) boomBarFill.parentElement.style.setProperty('--p', P.toFixed(3));
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
    if (boomStage) boomStage.classList.add('exploding');
    if (boomRaf === null) { lastBoomT = performance.now(); boomRaf = requestAnimationFrame(boomTick); }
  }
  function endHold() {
    holding = false;
    if (boomStage) boomStage.classList.remove('exploding');
  }
  function completeBoom() {
    doneLatch = true;
    endHold();
    if (boomStage) boomStage.classList.add('done');
    if (boomBtn) boomBtn.hidden = true;
    if (boomDone) boomDone.hidden = false;
  }
  if (boomBtn) {
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
    if (finderForm) {
      finderForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (resName) resName.textContent = fYear.value + ' ' + fMake.value + ' ' + fModel.value;
        if (finderResult) {
          finderResult.hidden = false;
          finderResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }
  }
  function fillModels() {
    if (!fModel || !fMake) return;
    fModel.innerHTML = '';
    (MAKES[fMake.value] || []).forEach(function (m) { fModel.add(new Option(m, m)); });
  }

  /* ---------- pause on hidden tabs ---------- */
  document.addEventListener('visibilitychange', function () {
    document.body.classList.toggle('paused', document.hidden);
  });
  var styleEl = document.createElement('style');
  styleEl.textContent = 'body.paused *,body.paused *::before,body.paused *::after{animation-play-state:paused!important}';
  document.head.appendChild(styleEl);

  /* ---------- reduced motion ---------- */
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) {
    if (e.matches) {
      document.body.classList.add('rm');
      revealEls.forEach(function (el) { el.classList.add('in'); el.classList.add('done'); });
      P = 1; doneLatch = true; paintBoom();
      if (boomStage) boomStage.classList.add('done');
      if (boomBtn) boomBtn.hidden = true;
      if (boomDone) boomDone.hidden = false;
    } else {
      document.body.classList.remove('rm');
      revealEls.forEach(function (el) { el.classList.remove('in'); el.classList.remove('done'); });
      seen = new WeakSet();
      if (isInnerPage) {
        document.querySelectorAll('.page-body [data-reveal] .part').forEach(function (el, i) {
          if (i < 3) { seen.add(el); el.classList.add('in'); el.classList.add('done'); }
        });
        partEls.forEach(function (el) { if (!seen.has(el)) revObs.observe(el); });
      } else {
        revealEls.forEach(function (el) { revObs.observe(el); });
      }
      P = 0; doneLatch = false; paintBoom();
      if (boomStage) boomStage.classList.remove('done');
      if (boomBtn) boomBtn.hidden = false;
      if (boomDone) boomDone.hidden = true;
    }
  });
})();
