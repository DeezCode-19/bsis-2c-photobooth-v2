/* =====================================================================
   CYBER BOOTH // BSIS 2C
   ---------------------------------------------------------------------
   CONFIGURATION: edit this object to rebrand. The capture and rendering
   logic below never needs to change for normal text/colour updates.

   - eventName / title / status / ticker: welcome screen + strip text
   - colors: used by the exported Canvas frame (keep in sync with style.css)
   - strip: pixel layout of the exported JPG
   - cacheName: must match CACHE in sw.js
   ===================================================================== */
const CONFIG = {
  eventName: 'CYBER BOOTH',
  title: 'CYBERSECURITY INVESTIGATION',
  status: 'CASE FILE // PHOTO EVIDENCE',
  evidencePrefix: 'EVIDENCE_',
  footerTitle: 'INVESTIGATION COMPLETE',
  footerSlogan: 'STOP THINK VERIFY',
  stamp: 'CLASSIFIED',
  caseCode: 'CASE-2C-',
  clearance: 'LEVEL 03',
  ticker: '/LOCAL PROCESSING /NO UPLOAD /CASE FILES: 03',
  filename: 'BSIS2C-Cyber-Booth-Photo-Evidence.jpg',
  colors: {
    bg: '#070a12', ink: '#070a12', panel: '#111a2e', panel2: '#16213a',
    paper: '#f7f1df', white: '#fffdf5', text: '#f8f8f2', muted: '#9fb0c8',
    line: '#31435f', lime: '#b8ff3d', cyan: '#4de8ff', pink: '#ff5ca8',
    yellow: '#ffd447', purple: '#9d7bff', red: '#ff5a5f', green: '#38f8a0'
  },
  // These local fonts are loaded by style.css and the service worker, so
  // Canvas text still works offline. System monospace is the fallback.
  fonts: {
    display: '400 {s}px "Press Start 2P","Courier New",monospace',
    body: '400 {s}px "VT323","Courier New",monospace'
  },
  strip: {
    w: 1080, margin: 90, photoW: 900, photoH: 700,
    labelH: 64, gap: 48, headerH: 440, footerH: 380, quality: 0.94
  },
  shots: 3,
  countdownSeconds: 3,
  prepMs: 1200,
  cacheName: 'bsis2c-photobooth-v6' // must match CACHE in sw.js
};

const $ = id => document.getElementById(id);
const font = (kind, size) => CONFIG.fonts[kind].replace('{s}', size);
const pad = n => String(n).padStart(2, '0');
const CANCEL = Symbol('cancel');
const allIndices = () => Array.from({ length: CONFIG.shots }, (_, i) => i);

// ---- State -----------------------------------------------------------
let stream = null, facing = 'user', mirrored = true;
let shots = Array(CONFIG.shots).fill(null);   // committed photos (canvases)
let token = 0, busy = false;                  // token invalidates running timers on cancel
let pendingList = [];                         // indices to capture in the next run
let stripBlob = null, stripUrl = null;
let camToken = 0;                             // ignores a late getUserMedia result
let zoom = { mode: 'visual', track: null, min: 1, max: 3, step: 0.1, value: 1 };
let zoomToken = 0, zoomTask = Promise.resolve();
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Apply config text to any element with data-cfg.
document.querySelectorAll('[data-cfg]').forEach(el => {
  if (CONFIG[el.dataset.cfg] != null) el.textContent = CONFIG[el.dataset.cfg];
});

// ---- Navigation ------------------------------------------------------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  document.body.dataset.screen = id;
  window.scrollTo(0, 0);
}

// ---- Camera lifecycle ------------------------------------------------
// Always stop every track when leaving the camera screen so the camera light turns off.
function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  const video = $('video');
  if (video) {
    video.srcObject = null;
    video.classList.remove('visual-zoom');
    video.style.removeProperty('--visual-zoom');
  }
  resetZoom();
}

function resetZoom() {
  zoomToken++;
  zoomTask = Promise.resolve();
  zoom = { mode: 'visual', track: null, min: 1, max: 3, step: 0.1, value: 1 };
  updateZoomUI();
}

function clampZoom(value) {
  const clamped = Math.min(zoom.max, Math.max(zoom.min, Number(value)));
  const stepped = zoom.step > 0
    ? zoom.min + Math.round((clamped - zoom.min) / zoom.step) * zoom.step
    : clamped;
  return Number(Math.min(zoom.max, Math.max(zoom.min, stepped)).toFixed(4));
}

function updateZoomUI() {
  const slider = $('zoom-slider');
  slider.min = String(zoom.min);
  slider.max = String(zoom.max);
  slider.step = zoom.step > 0 ? String(zoom.step) : 'any';
  slider.value = String(zoom.value);
  $('zoom-value').textContent = `${Math.round(zoom.value * 100)}%`;
  $('zoom-mode').textContent = zoom.mode === 'hardware'
    ? 'HARDWARE CAMERA ZOOM'
    : 'VISUAL ONLY - SAVED PHOTO CROP MATCHES';

  const video = $('video');
  video.classList.toggle('visual-zoom', zoom.mode === 'visual' && Boolean(zoom.track));
  if (zoom.mode === 'visual' && zoom.track) {
    video.style.setProperty('--visual-zoom', String(zoom.value));
  } else {
    video.style.removeProperty('--visual-zoom');
  }
  updateZoomControls();
}

function updateZoomControls() {
  const active = Boolean(stream && zoom.track && !busy);
  $('zoom-slider').disabled = !active || zoom.max <= zoom.min;
  $('btn-zoom-out').disabled = !active || zoom.value <= zoom.min;
  $('btn-zoom-in').disabled = !active || zoom.value >= zoom.max;
}

function configureZoom(track) {
  let capabilities = null;
  try {
    if (track.getCapabilities) capabilities = track.getCapabilities();
  } catch (error) {
    console.warn('Could not read camera zoom capabilities; using visual zoom.', error);
  }

  const range = capabilities && capabilities.zoom;
  if (range && Number.isFinite(range.min) && Number.isFinite(range.max) &&
      range.max >= range.min && typeof track.applyConstraints === 'function') {
    let settings = {};
    try {
      if (track.getSettings) settings = track.getSettings();
    } catch (error) {
      console.warn('Could not read the camera zoom setting; using its 1x default.', error);
    }
    const defaultZoom = Number.isFinite(settings.zoom)
      ? settings.zoom
      : Math.min(range.max, Math.max(range.min, 1));
    zoom = {
      mode: 'hardware',
      track,
      min: range.min,
      max: range.max,
      step: Number.isFinite(range.step) && range.step > 0 ? range.step : 0,
      value: Math.min(range.max, Math.max(range.min, defaultZoom))
    };
  } else {
    zoom = { mode: 'visual', track, min: 1, max: 3, step: 0.1, value: 1 };
  }
  updateZoomUI();
}

function changeZoom(value) {
  const request = ++zoomToken;
  const target = clampZoom(value);
  const track = zoom.track;
  zoom.value = target;
  updateZoomUI();

  if (zoom.mode !== 'hardware' || !track) return Promise.resolve();

  zoomTask = zoomTask.catch(error => {
    console.error('Previous camera zoom change failed.', error);
  }).then(async () => {
    if (request !== zoomToken || track !== zoom.track) return;
    try {
      await track.applyConstraints({ advanced: [{ zoom: target }] });
    } catch (error) {
      if (request !== zoomToken || track !== zoom.track) return;
      console.warn('Hardware zoom is unavailable; using visual zoom instead.', error);
      zoom.mode = 'visual';
      zoom.min = 1;
      zoom.max = 3;
      zoom.step = 0.1;
      zoom.value = clampZoom(target);
    }
    if (request === zoomToken && track === zoom.track) updateZoomUI();
  });
  return zoomTask;
}

function camError(message) {
  $('cam-msg-text').textContent = message;
  $('cam-msg').hidden = false;
  $('btn-begin').disabled = true;
  $('stage').setAttribute('aria-busy', 'false');
}

function explainCameraError(error) {
  const name = error && error.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Camera access was blocked. Tap the lock or camera icon in your browser address bar, set Camera to Allow, then tap TRY CAMERA AGAIN. On iPhone: Settings > Safari > Camera.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera was found on this device. Connect a camera or try another phone, then tap TRY CAMERA AGAIN.';
  }
  if (name === 'NotReadableError') {
    return 'The camera is being used by another app. Close other apps that use the camera, then try again.';
  }
  return 'The camera stopped unexpectedly. Tap TRY CAMERA AGAIN to resume your session. Your earlier photos are kept.';
}

async function waitForVideoSize(video, timeout = 3500) {
  if (video.videoWidth && video.videoHeight) return true;
  await new Promise(resolve => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('loadedmetadata', finish);
      resolve();
    };
    video.addEventListener('loadedmetadata', finish, { once: true });
    setTimeout(finish, timeout);
  });
  return Boolean(video.videoWidth && video.videoHeight);
}

async function startCamera() {
  const myToken = ++camToken;
  stopCamera();
  $('cam-msg').hidden = true;
  $('btn-begin').disabled = true;
  $('stage').setAttribute('aria-busy', 'false');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    camError('This browser cannot open the camera. Use Chrome on Android or Safari on iPhone, over HTTPS or localhost.');
    return false;
  }

  let nextStream = null;
  try {
    nextStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 } },
      audio: false
    });
    if (myToken !== camToken) {
      nextStream.getTracks().forEach(track => track.stop());
      return false;
    }
    stream = nextStream;
  } catch (error) {
    if (myToken === camToken) camError(explainCameraError(error));
    return false;
  }

  if (!nextStream) return false;
  const video = $('video');
  video.srcObject = nextStream;
  try { await video.play(); } catch (_) { /* muted autoplay is allowed in modern browsers */ }
  await waitForVideoSize(video);

  // A second startCamera() call (for example SWITCH CAMERA) may have replaced
  // this stream while we were waiting. Never let the old request take over.
  if (myToken !== camToken || stream !== nextStream) {
    nextStream.getTracks().forEach(track => track.stop());
    if (stream === nextStream) stopCamera();
    return false;
  }

  const track = nextStream.getVideoTracks()[0];
  const settings = track && track.getSettings ? track.getSettings() : {};
  if (settings.facingMode) facing = settings.facingMode === 'environment' ? 'environment' : 'user';
  mirrored = facing === 'user';                 // mirror selfie preview AND the saved photo
  video.classList.toggle('mirror', mirrored);
  if (track) configureZoom(track);

  if (track) {
    track.addEventListener('ended', () => {     // browser/OS interrupted the camera
      if (stream === nextStream) {
        cancelRun();
        stopCamera();
        camError(explainCameraError({ name: 'NotReadableError' }));
      }
    });
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    $('btn-switch').hidden = devices.filter(d => d.kind === 'videoinput').length < 2;
  } catch (_) { /* device labels are optional */ }

  if (myToken !== camToken || stream !== nextStream) return false;
  $('btn-begin').disabled = !video.videoWidth;
  updateZoomControls();
  return Boolean(video.videoWidth);
}

async function enterCamera(list) {
  pendingList = list;
  show('s-camera');
  resetCaptureUI();
  await startCamera();
}

function resetCaptureUI() {
  const single = pendingList.length === 1;
  $('progress').textContent = 'CAMERA SETUP';
  $('btn-begin').textContent = single ? `RETAKE ${CONFIG.evidencePrefix}${pad(pendingList[0] + 1)}` : 'START COUNTDOWN';
  $('hint').textContent = 'Frame your face inside the box.';
  $('countdown').textContent = '';
  setDots(-1, []);
  $('btn-cancel').disabled = false;
  $('stage').setAttribute('aria-busy', 'false');
}

function setDots(active, done) {
  [...$('dots').children].forEach((dot, i) => {
    dot.className = done.includes(i) ? 'done' : (i === active ? 'on' : '');
  });
}

// ---- Capture workflow ------------------------------------------------
// Cancelable sleep: if the token changed while waiting, the whole run aborts.
const wait = (ms, tok) => new Promise((resolve, reject) => {
  setTimeout(() => tok === token ? resolve() : reject(CANCEL), ms);
});

function cancelRun() {
  token++;
  busy = false;
}

// Crop the live video to the same aspect ratio as the strip slot (no stretching).
// Mirrored for the front camera so the saved photo matches the preview.
function grab() {
  const video = $('video');
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh || video.readyState < 2) throw new Error('video not ready');
  const S = CONFIG.strip;
  const ratio = S.photoW / S.photoH;
  let sw, sh;
  if (vw / vh > ratio) { sh = vh; sw = vh * ratio; }
  else { sw = vw; sh = vw / ratio; }

  const canvas = document.createElement('canvas');
  canvas.width = 1170;
  canvas.height = Math.round(1170 / ratio);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (zoom.mode === 'visual') {
    sw /= zoom.value;
    sh /= zoom.value;
  }
  if (mirrored) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function runCapture() {
  if (busy || !stream) return;                  // blocks double taps and overlapping timers
  busy = true;
  const tok = ++token;
  const list = pendingList.slice();
  const temp = {};
  const done = [];
  $('btn-begin').disabled = true;
  $('btn-switch').hidden = true;
  $('btn-cancel').disabled = false;
  $('stage').setAttribute('aria-busy', 'true');
  updateZoomControls();

  try {
    await zoomTask;
    for (let n = 0; n < list.length; n++) {
      const index = list[n];
      $('progress').textContent = `${CONFIG.evidencePrefix}${pad(index + 1)} / ${pad(CONFIG.shots)}`;
      setDots(index, done);
      $('hint').textContent = n === 0 ? 'Get ready...' : 'Next picture. Get ready...';
      await wait(n === 0 ? 900 : CONFIG.prepMs, tok);   // preparation interval

      $('hint').textContent = 'Hold still.';
      for (let s = CONFIG.countdownSeconds; s > 0; s--) {
        $('countdown').textContent = s;
        await wait(1000, tok);
      }
      $('countdown').textContent = '';
      temp[index] = grab();

      const flash = $('flash');
      flash.classList.remove('go');
      void flash.offsetWidth;
      flash.classList.add('go');

      done.push(index);
      setDots(-1, done);
      await wait(500, tok);
    }

    // Commit only after every requested photo succeeded; cancelled runs never overwrite old photos.
    list.forEach(index => { shots[index] = temp[index]; });
    busy = false;
    $('stage').setAttribute('aria-busy', 'false');
    stopCamera();
    renderReview();
    show('s-review');
  } catch (error) {
    if (error === CANCEL) {
      busy = false;
      $('stage').setAttribute('aria-busy', 'false');
      return;
    }
    busy = false;
    resetCaptureUI();
    camError('Capture was interrupted. Tap TRY CAMERA AGAIN to resume. Your earlier photos are kept.');
    stopCamera();
  }
}

// Leaving the page mid-capture: abort cleanly and let the visitor resume.
document.addEventListener('visibilitychange', async () => {
  if (!$('s-camera').classList.contains('active')) return;
  if (document.hidden) {
    if (busy) { cancelRun(); resetCaptureUI(); }
    stopCamera();
  } else if (!stream) {
    await startCamera();
  }
});

// ---- Review ----------------------------------------------------------
function renderReview() {
  const grid = $('review-grid');
  grid.textContent = '';
  shots.forEach((canvas, i) => {
    const cell = document.createElement('div');
    cell.className = 'cell';

    const label = document.createElement('div');
    label.className = 'lbl';
    label.textContent = `${CONFIG.evidencePrefix}${pad(i + 1)}`;

    const retake = document.createElement('button');
    retake.type = 'button';
    retake.className = 'btn';
    retake.textContent = 'RETAKE THIS ONE';
    retake.addEventListener('click', () => enterCamera([i]));

    cell.append(label, canvas, retake);
    grid.append(cell);
  });
  $('btn-generate').disabled = !shots.every(Boolean);
}

// ---- Strip composition -----------------------------------------------
// Everything below is drawn with Canvas calls only (no CSS, no external
// images), so the exported JPG contains the whole frame and works offline.

// Small seeded PRNG: every strip gets its own case ID, hex strings and barcode.
function rng(seed) {
  return () => {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const hex = (random, n) => Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('').toUpperCase();

// Letter-spaced text, drawn per character so every browser tracks identically.
function tText(ctx, text, px, py, size, track, kind, color, align = 'left') {
  ctx.font = font(kind, size);
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const chars = [...text];
  const width = chars.reduce((total, ch) => total + ctx.measureText(ch).width + track, 0) - track;
  let cursor = align === 'center' ? px - width / 2 : align === 'right' ? px - width : px;
  for (const ch of chars) {
    ctx.fillText(ch, cursor, py);
    cursor += ctx.measureText(ch).width + track;
  }
  return width;
}

function fillRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// Draw only the four sides of a rectangle, leaving its centre untouched.
function ring(ctx, x, y, w, h, thickness, color) {
  fillRect(ctx, x, y, w, thickness, color);
  fillRect(ctx, x, y + h - thickness, w, thickness, color);
  fillRect(ctx, x, y, thickness, h, color);
  fillRect(ctx, x + w - thickness, y, thickness, h, color);
}

function pixelStar(ctx, cx, cy, radius, color) {
  const arm = Math.max(2, Math.round(radius / 2));
  fillRect(ctx, cx - radius, cy - arm, radius * 2, arm * 2, color);
  fillRect(ctx, cx - arm, cy - radius, arm * 2, radius * 2, color);
}

function pixelCross(ctx, cx, cy, radius, color) {
  const arm = Math.max(1, Math.round(radius / 3));
  fillRect(ctx, cx - radius, cy - arm, radius * 2, arm * 2, color);
  fillRect(ctx, cx - arm, cy - radius, arm * 2, radius * 2, color);
}

// 16x16 pixel shield used by the logo, header and footer.
const SHIELD_ROWS = [
  [4, 11], [3, 12], [2, 13], [2, 13], [2, 13], [2, 13], [2, 13],
  [2, 13], [2, 13], [3, 12], [4, 11], [5, 10], [6, 9], [7, 8]
];

function drawShield(ctx, px, py, unit, C) {
  // colourful offset shadow
  SHIELD_ROWS.forEach(([a, b], i) => {
    fillRect(ctx, px + (a + 2) * unit, py + (i + 2) * unit, (b - a + 1) * unit, unit, C.pink);
  });
  // black silhouette, white sticker border, lime fill
  SHIELD_ROWS.forEach(([a, b], i) => {
    fillRect(ctx, px + a * unit, py + (i + 1) * unit, (b - a + 1) * unit, unit, C.ink);
  });
  SHIELD_ROWS.forEach(([a, b], i) => {
    if (b - a >= 2) fillRect(ctx, px + (a + 1) * unit, py + (i + 1) * unit, (b - a - 1) * unit, unit, C.paper);
  });
  SHIELD_ROWS.forEach(([a, b], i) => {
    if (b - a >= 4) fillRect(ctx, px + (a + 2) * unit, py + (i + 1) * unit, (b - a - 3) * unit, unit, C.lime);
  });
  // tiny camera in the middle
  fillRect(ctx, px + 5 * unit, py + 7 * unit, 6 * unit, 4 * unit, C.ink);
  fillRect(ctx, px + 6 * unit, py + 7 * unit, 4 * unit, unit, C.paper);
  fillRect(ctx, px + 6 * unit, py + 8 * unit, 4 * unit, 2 * unit, C.cyan);
  fillRect(ctx, px + 7 * unit, py + 8 * unit, 2 * unit, 2 * unit, C.ink);
  fillRect(ctx, px + 10 * unit, py + 7 * unit, unit, unit, C.yellow);
  fillRect(ctx, px + 4 * unit, py + 3 * unit, 2 * unit, unit, C.white);
}

function drawBarcode(ctx, x, y, w, h, random, C) {
  fillRect(ctx, x - 6, y - 6, w + 12, h + 12, C.paper);
  ring(ctx, x - 6, y - 6, w + 12, h + 12, 3, C.ink);
  let cursor = x;
  while (cursor < x + w) {
    const barWidth = 2 + Math.floor(random() * 5);
    fillRect(ctx, cursor, y, Math.min(barWidth, x + w - cursor), h, C.ink);
    cursor += barWidth + 2 + Math.floor(random() * 4);
  }
}

function drawHazard(ctx, x, y, w, C) {
  const block = 20;
  for (let i = 0, px = x; px < x + w; i++, px += block) {
    fillRect(ctx, px, y, Math.min(block, x + w - px), 12, i % 2 ? C.ink : C.yellow);
  }
}

function drawPhotoFrame(ctx, x, y, w, h, shadowColor, C) {
  fillRect(ctx, x + 22, y + 22, w, h, shadowColor);          // colourful pixel shadow
  fillRect(ctx, x - 16, y - 16, w + 32, h + 32, C.ink);      // thick outer outline
  fillRect(ctx, x - 10, y - 10, w + 20, h + 20, C.paper);    // white sticker border
  fillRect(ctx, x - 4, y - 4, w + 8, h + 8, C.ink);          // inner outline
}

function drawHeader(ctx, W, caseId, date, C) {
  const m = CONFIG.strip.margin;

  // micro status row
  tText(ctx, 'BSIS 2C // SECURE PHOTO UNIT', m, 90, 21, 2, 'body', C.muted);
  const localW = tText(ctx, 'LOCAL ONLY', W - m - 18, 90, 21, 2, 'body', C.green, 'right');
  fillRect(ctx, W - m - localW - 36, 74, 14, 14, C.ink);
  fillRect(ctx, W - m - localW - 34, 76, 10, 10, C.green);

  // pixel shield logo
  drawShield(ctx, m, 104, 6, C);

  // title + offset shadows
  const titleX = m + 118, titleY = 166;
  tText(ctx, CONFIG.eventName, titleX + 8, titleY + 8, 70, -2, 'display', C.ink);
  tText(ctx, CONFIG.eventName, titleX + 4, titleY + 4, 70, -2, 'display', C.pink);
  tText(ctx, CONFIG.eventName, titleX, titleY, 70, -2, 'display', C.paper);

  tText(ctx, CONFIG.title, titleX + 3, 212, 22, 3, 'display', C.ink);
  tText(ctx, CONFIG.title, titleX, 209, 22, 3, 'display', C.cyan);

  // tagline + classified stamp
  tText(ctx, 'CREATE YOUR PHOTO EVIDENCE', m, 252, 25, 2, 'body', C.lime);
  ring(ctx, W - m - 176, 226, 176, 38, 3, C.red);
  tText(ctx, CONFIG.stamp, W - m - 88, 252, 15, 1, 'display', C.red, 'center');
  fillRect(ctx, W - m - 160, 242, 8, 8, C.red);

  // metadata card
  const metaY = 274, metaH = 90, cw = (W - 2 * m) / 4;
  fillRect(ctx, m, metaY, W - 2 * m, metaH, C.panel);
  ring(ctx, m, metaY, W - 2 * m, metaH, 2, C.line);
  const meta = [
    ['CASE ID', caseId, C.text, C.pink],
    ['DATE UTC', date, C.text, C.cyan],
    ['CLEARANCE', CONFIG.clearance, C.text, C.yellow],
    ['STATUS', 'SEALED', C.green, C.lime]
  ];
  meta.forEach(([label, value, color, accent], i) => {
    const x = m + i * cw;
    if (i) fillRect(ctx, x, metaY + 12, 1, metaH - 24, C.line);
    fillRect(ctx, x + 14, metaY + 12, 32, 5, accent);
    tText(ctx, label, x + 14, metaY + 37, 17, 2, 'body', C.muted);
    tText(ctx, value, x + 14, metaY + 69, 25, 1, 'body', color);
  });
}

function drawEvidence(ctx, index, shot, random, C) {
  const S = CONFIG.strip, m = S.margin, W = S.w;
  const slot = S.labelH + S.photoH + S.gap;
  const y0 = S.headerH + index * slot;
  const x = m, y = y0 + S.labelH;
  const w = S.photoW, h = S.photoH;

  fillRect(ctx, m, y0 + 22, 10, 10, [C.pink, C.cyan, C.yellow][index % 3]);
  tText(ctx, `${CONFIG.evidencePrefix}${pad(index + 1)}`, m + 22, y0 + 36, 20, 2, 'display', C.lime);
  tText(ctx, `${shot ? shot.width : '----'}x${shot ? shot.height : '----'}  SHA ${hex(random, 10)}`,
    W - m, y0 + 34, 18, 1, 'body', C.muted, 'right');

  drawPhotoFrame(ctx, x, y, w, h, [C.pink, C.cyan, C.yellow][index % 3], C);
  fillRect(ctx, x, y, w, h, C.panel);
  if (shot) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(shot, x, y, w, h);
  } else {
    tText(ctx, 'NO SIGNAL', x + w / 2, y + h / 2, 38, 4, 'display', C.muted, 'center');
  }

  // technical corner marks sit on the thick black frame
  [[x - 10, y - 10], [x + w + 10, y - 10], [x - 10, y + h + 10], [x + w + 10, y + h + 10]]
    .forEach(([cx, cy]) => pixelCross(ctx, cx, cy, 9, C.cyan));
}

function drawFooter(ctx, W, H, random, C) {
  const S = CONFIG.strip, m = S.margin;
  const F0 = H - S.footerH;

  drawHazard(ctx, m, F0 + 18, W - 2 * m, C);

  // main completion title
  tText(ctx, CONFIG.footerTitle, W / 2 + 6, F0 + 104, 30, 2, 'display', C.ink, 'center');
  tText(ctx, CONFIG.footerTitle, W / 2 + 3, F0 + 101, 30, 2, 'display', C.pink, 'center');
  tText(ctx, CONFIG.footerTitle, W / 2, F0 + 98, 30, 2, 'display', C.paper, 'center');
  tText(ctx, 'PHOTO EVIDENCE // BSIS 2C', W / 2, F0 + 130, 19, 3, 'body', C.muted, 'center');

  // slogan as three arcade blocks
  const words = CONFIG.footerSlogan.split(/\s+/).slice(0, 3);
  const gap = 14, bw = (W - 2 * m - gap * 2) / 3, by = F0 + 146, bh = 58;
  words.forEach((word, i) => {
    const bx = m + i * (bw + gap);
    if (i === 2) {
      fillRect(ctx, bx, by, bw, bh, C.lime);
      ring(ctx, bx, by, bw, bh, 4, C.ink);
      tText(ctx, word, bx + bw / 2, by + 38, 17, 3, 'display', C.ink, 'center');
    } else {
      ring(ctx, bx, by, bw, bh, 4, i === 0 ? C.red : C.cyan);
      tText(ctx, word, bx + bw / 2, by + 38, 17, 3, 'display', C.paper, 'center');
    }
    if (i === 0) fillRect(ctx, bx + 12, by + 22, 9, 9, C.red);
  });

  // shield + signature + barcode
  const sy = F0 + 246;
  drawShield(ctx, m + 10, sy - 26, 4, C);
  tText(ctx, 'DIGITAL SIGNATURE', m + 112, sy - 22, 16, 3, 'body', C.muted);
  tText(ctx, '0x' + hex(random, 16), m + 112, sy + 2, 23, 1, 'body', C.text);
  tText(ctx, 'BSIS 2C // PHOTO EVIDENCE', m + 112, sy + 28, 16, 2, 'body', C.cyan);
  drawBarcode(ctx, W - m - 190, sy - 28, 190, 58, random, C);

  // ticker
  tText(ctx, CONFIG.ticker, W / 2, H - 80, 15, 2, 'body', C.muted, 'center');
}

async function composeStrip() {
  const S = CONFIG.strip, C = CONFIG.colors;
  const N = CONFIG.shots;
  const slot = S.labelH + S.photoH + S.gap;
  const W = S.w;
  const H = S.headerH + N * slot + S.footerH;

  // Make sure the bundled pixel fonts are loaded before drawing Canvas text.
  try {
    await Promise.all([
      document.fonts.load('400 20px "Press Start 2P"'),
      document.fonts.load('400 20px "VT323"')
    ]);
  } catch (_) { /* fall back to the monospace stack */ }

  const seed = Date.now();
  const R = rng(seed);
  const caseId = CONFIG.caseCode + hex(R, 4);
  const date = new Date().toISOString().slice(0, 10);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 1. Atmosphere: deep navy, pixel grid, glows and hard-edged stars.
  fillRect(ctx, 0, 0, W, H, C.bg);
  const glow = (cx, cy, radius, rgba) => {
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, rgba);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);
  };
  glow(80, 30, W * 0.9, 'rgba(157,123,255,0.24)');
  glow(W - 80, 260, W * 0.75, 'rgba(77,232,255,0.16)');
  glow(W / 2, H, W * 0.95, 'rgba(255,92,168,0.12)');

  for (let gx = 0; gx <= W; gx += 24) {
    ctx.strokeStyle = gx % 120 === 0 ? 'rgba(77,232,255,0.10)' : 'rgba(77,232,255,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gx + 0.5, 0);
    ctx.lineTo(gx + 0.5, H);
    ctx.stroke();
  }
  for (let gy = 0; gy <= H; gy += 24) {
    ctx.strokeStyle = gy % 120 === 0 ? 'rgba(77,232,255,0.10)' : 'rgba(77,232,255,0.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, gy + 0.5);
    ctx.lineTo(W, gy + 0.5);
    ctx.stroke();
  }

  const stars = [
    [34, 112, 5, C.cyan], [42, 302, 4, C.pink], [1046, 78, 5, C.yellow],
    [1032, 380, 4, C.lime], [30, 1340, 4, C.pink], [1052, 1510, 5, C.cyan],
    [28, 2510, 5, C.yellow], [1048, 2740, 4, C.pink], [46, 3120, 4, C.cyan],
    [1034, 3168, 5, C.lime]
  ];
  stars.forEach(([x, y, r, color]) => pixelStar(ctx, x, y, r, color));

  // subtle scan lines over the background
  ctx.fillStyle = 'rgba(255,255,255,0.022)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);

  // 2. Layered pixel frame: pink shadow, black outline, white sticker, black inner edge.
  const fx = 50, fy = 50, fw = W - 100, fh = H - 100;
  ring(ctx, fx + 18, fy + 18, fw, fh, 12, C.pink);
  ring(ctx, fx - 12, fy - 12, fw + 24, fh + 24, 12, C.ink);
  ring(ctx, fx, fy, fw, fh, 10, C.paper);
  ring(ctx, fx + 10, fy + 10, fw - 20, fh - 20, 5, C.ink);

  // corner pixels add to the sticker/arcade feel
  [[fx - 24, fy + 52, C.cyan], [fx + fw + 14, fy + 52, C.pink],
   [fx - 24, fy + fh - 64, C.yellow], [fx + fw + 14, fy + fh - 64, C.lime]]
    .forEach(([x, y, color]) => fillRect(ctx, x, y, 10, 10, color));

  // 3. Header, photos and footer.
  drawHeader(ctx, W, caseId, date, C);
  for (let i = 0; i < N; i++) drawEvidence(ctx, i, shots[i], R, C);
  drawFooter(ctx, W, H, R, C);

  // 4. Export. The JPG includes every pixel drawn above.
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('JPG export failed')), 'image/jpeg', S.quality);
  });
}

async function generate() {
  if (!shots.every(Boolean)) {
    alert('Take all three photos before creating the strip.');
    return;
  }
  const btn = $('btn-generate');
  const label = btn.querySelector('.btn-label') || btn;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  const original = label.textContent;
  label.textContent = 'BUILDING...';

  try {
    if (stripUrl) URL.revokeObjectURL(stripUrl);
    stripBlob = await composeStrip();
    stripUrl = URL.createObjectURL(stripBlob);
    $('strip-img').src = stripUrl;
    $('dl-note').textContent = '';
    $('ios-note').hidden = !isIOS;
    show('s-done');
  } catch (error) {
    console.error(error);
    alert('Could not create the photo strip. Please try again.');
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    label.textContent = original || 'CREATE PHOTO STRIP';
  }
}

// ---- Download ---------------------------------------------------------
async function download() {
  const note = $('dl-note');
  if (!stripBlob) return;

  try {
    // iOS Safari often ignores the download attribute; the share sheet offers Save Image.
    if (isIOS && navigator.canShare && typeof File === 'function') {
      try {
        const file = new File([stripBlob], CONFIG.filename, { type: 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file] });
            return;
          } catch (error) {
            if (error.name === 'AbortError') return;
          }
        }
      } catch (_) { /* fall through to the download link */ }
    }

    const anchor = document.createElement('a');
    anchor.href = stripUrl;
    anchor.download = CONFIG.filename;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    note.textContent = isIOS
      ? 'If nothing saved, press and hold the image and choose Add to Photos.'
      : 'Download started. Check your Downloads folder.';
  } catch (error) {
    note.textContent = 'Download failed. Press and hold the image to save it.';
  }
}

// ---- New session: release everything ---------------------------------
function newSession() {
  cancelRun();
  stopCamera();
  if (stripUrl) { URL.revokeObjectURL(stripUrl); stripUrl = null; }
  stripBlob = null;
  $('strip-img').removeAttribute('src');
  shots = Array(CONFIG.shots).fill(null);
  pendingList = [];
  $('review-grid').textContent = '';
  $('dl-note').textContent = '';
  $('ios-note').hidden = true;
  $('btn-generate').disabled = false;
  show('s-welcome');
}

// ---- Wiring -----------------------------------------------------------
$('btn-start').addEventListener('click', () => enterCamera(allIndices()));
$('btn-begin').addEventListener('click', runCapture);
$('zoom-slider').addEventListener('input', event => changeZoom(event.currentTarget.value));
$('btn-zoom-out').addEventListener('click', () => {
  changeZoom(zoom.value - (zoom.step || 0.1));
});
$('btn-zoom-in').addEventListener('click', () => {
  changeZoom(zoom.value + (zoom.step || 0.1));
});
$('btn-retry').addEventListener('click', async () => {
  resetCaptureUI();
  await startCamera();
});
$('btn-switch').addEventListener('click', async () => {
  facing = facing === 'user' ? 'environment' : 'user';
  await startCamera();
});
$('btn-cancel').addEventListener('click', () => {
  cancelRun();
  stopCamera();
  if (shots.every(Boolean)) {
    renderReview();
    show('s-review');
  } else {
    newSession();
  }
});
$('btn-retake-all').addEventListener('click', () => enterCamera(allIndices()));
$('btn-generate').addEventListener('click', generate);
$('btn-download').addEventListener('click', download);
$('btn-new').addEventListener('click', newSession);
window.addEventListener('pagehide', stopCamera);

// ---- PWA: register SW; show OFFLINE READY only after the cache holds the shell ----
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(async () => {
      const cache = await caches.open(CONFIG.cacheName);
      if (await cache.match(new URL('index.html', location.href).href)) {
        $('offline-badge').hidden = false;
      }
    })
    .catch(() => {});
}
