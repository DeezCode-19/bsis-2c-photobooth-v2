/* =====================================================================
   CONFIGURATION: edit this object to rebrand. The rendering logic below
   never needs to change.
   - eventName / title / status / footer*: frame and welcome-screen text
   - colors: used by the exported canvas frame
   - strip: pixel layout of the exported JPG (keep photoW:photoH matching the preview box in style.css)
   ===================================================================== */
const CONFIG = {
  eventName: 'CYBER BOOTH',
  title: 'CYBERSECURITY INVESTIGATION',
  status: 'CASE FILE // PHOTO EVIDENCE',
  evidencePrefix: 'EVIDENCE_',
  footerTitle: 'INVESTIGATION COMPLETE',
  footerSlogan: 'STOP. THINK. VERIFY.',   // three words, drawn as three segments
  stamp: 'CLASSIFIED',
  caseCode: 'CASE-2C-',                    // a random 4-digit hex is appended per strip
  clearance: 'LEVEL 03',
  ticker: '/INVESTIGATION ACTIVE   /CASE FILES: 03   /SECURITY LEVEL: ACTIVE',
  filename: 'BSIS2C-Cybersecurity-Photo-Evidence.jpg',
  // Colors copied from the booth site (style.css): --bg, --ink, --muted, --acid/--blue, cyan, --danger
  colors: { bg: '#050505', text: '#eef1ee', muted: '#868f88', blue: '#2eaaff', cyan: '#00d4ff',
            green: '#00ff8c', red: '#ff4d4d', panel: '#0d1117' },
  // Space Grotesk is bundled in assets/fonts (loaded by style.css) so it works offline; system sans is the fallback.
  fonts: { head: '700 {s}px "Space Grotesk","Segoe UI","Helvetica Neue",Arial,sans-serif',
           label: '500 {s}px "Space Grotesk","Segoe UI","Helvetica Neue",Arial,sans-serif',
           mono: '500 {s}px "SFMono-Regular",Menlo,Consolas,"Courier New",monospace' },
  strip: { w: 940, margin: 80, photoW: 780, photoH: 680, labelH: 52, gap: 40, headerH: 340, footerH: 400, quality: 0.92 },
  shots: 3, countdownSeconds: 3, prepMs: 1500,
  cacheName: 'bsis2c-photobooth-v4' // must match CACHE in sw.js
};

const $ = id => document.getElementById(id);
const font = (k, s) => CONFIG.fonts[k].replace('{s}', s);
const pad = n => String(n).padStart(2, '0');
const CANCEL = Symbol('cancel');

// ---- State ----------------------------------------------------------
let stream = null, facing = 'user', mirrored = true;
let shots = Array(CONFIG.shots).fill(null);   // committed photos (canvases)
let token = 0, busy = false;                  // token invalidates running timers on cancel
let pendingList = [];                         // indices to capture in the next run
let stripBlob = null, stripUrl = null;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Apply config text to the welcome screen.
document.querySelectorAll('[data-cfg]').forEach(el => { el.textContent = CONFIG[el.dataset.cfg]; });

// ---- Navigation -------------------------------------------------------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  window.scrollTo(0, 0);
}

// ---- Camera lifecycle -------------------------------------------------
// Always stop every track when leaving the camera screen so the camera light turns off.
function stopCamera() {
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  $('video').srcObject = null;
}

function camError(msg) {
  $('cam-msg-text').textContent = msg;
  $('cam-msg').hidden = false;
  $('btn-begin').disabled = true;
}

function explain(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError')
    return 'Camera access was blocked. Tap the lock or camera icon in your browser address bar, set Camera to Allow, then tap TRY CAMERA AGAIN. On iPhone: Settings > Safari > Camera.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera was found on this device.';
  if (n === 'NotReadableError') return 'The camera is being used by another app. Close other apps that use the camera, then try again.';
  return 'The camera stopped unexpectedly. Tap TRY CAMERA AGAIN to resume your session.';
}

async function startCamera() {
  stopCamera();
  $('cam-msg').hidden = true;
  $('btn-begin').disabled = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    camError('This browser cannot open the camera. Use Chrome on Android or Safari on iPhone, over HTTPS.');
    return false;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 } }, audio: false });
  } catch (e) { camError(explain(e)); return false; }
  const v = $('video');
  v.srcObject = stream;
  try { await v.play(); } catch (_) {}
  const track = stream.getVideoTracks()[0];
  const fm = track.getSettings().facingMode;
  if (fm) facing = fm === 'environment' ? 'environment' : 'user';
  mirrored = facing === 'user';                 // mirror selfie preview AND the saved photo
  v.classList.toggle('mirror', mirrored);
  track.addEventListener('ended', () => {       // browser/OS interrupted the camera
    if (stream) { cancelRun(); stopCamera(); camError(explain()); }
  });
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    $('btn-switch').hidden = devs.filter(d => d.kind === 'videoinput').length < 2;
  } catch (_) {}
  $('btn-begin').disabled = false;
  return true;
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
}

function setDots(active, done) {
  [...$('dots').children].forEach((d, i) => { d.className = done.includes(i) ? 'done' : (i === active ? 'on' : ''); });
}

// ---- Capture workflow -------------------------------------------------
// Cancelable sleep: if the token changed while waiting, the whole run aborts.
const wait = (ms, tok) => new Promise((res, rej) => setTimeout(() => tok === token ? res() : rej(CANCEL), ms));

function cancelRun() { token++; busy = false; }

// Crop the live video to the same aspect ratio as the strip slot (no stretching).
// Mirrored for the front camera so the saved photo matches the preview.
function grab() {
  const v = $('video'), vw = v.videoWidth, vh = v.videoHeight;
  if (!vw || !vh || v.readyState < 2) throw new Error('video not ready');
  const P = CONFIG.strip, r = P.photoW / P.photoH;
  let sw, sh;
  if (vw / vh > r) { sh = vh; sw = vh * r; } else { sw = vw; sh = vw / r; }
  const c = document.createElement('canvas');
  c.width = 1170; c.height = Math.round(1170 / r);
  const x = c.getContext('2d');
  if (mirrored) { x.translate(c.width, 0); x.scale(-1, 1); }
  x.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  return c;
}

async function runCapture() {
  if (busy || !stream) return;                  // blocks double taps and overlapping timers
  busy = true;
  const tok = ++token, list = pendingList.slice(), temp = {}, done = [];
  $('btn-begin').disabled = true; $('btn-switch').hidden = true; $('btn-cancel').disabled = false;
  try {
    for (let n = 0; n < list.length; n++) {
      const i = list[n];
      $('progress').textContent = `EVIDENCE ${pad(i + 1)} / ${pad(CONFIG.shots)}`;
      setDots(i, done);
      $('hint').textContent = n === 0 ? 'Get ready...' : 'Next picture. Get ready...';
      await wait(n === 0 ? 900 : CONFIG.prepMs, tok);   // preparation interval
      $('hint').textContent = 'Hold still.';
      for (let s = CONFIG.countdownSeconds; s > 0; s--) { $('countdown').textContent = s; await wait(1000, tok); }
      $('countdown').textContent = '';
      temp[i] = grab();
      const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
      done.push(i); setDots(-1, done);
      await wait(500, tok);
    }
    // Commit only after every requested photo succeeded; cancelled runs never overwrite old photos.
    list.forEach(i => { shots[i] = temp[i]; });
    busy = false;
    stopCamera();
    renderReview();
    show('s-review');
  } catch (e) {
    if (e === CANCEL) return;
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
  shots.forEach((c, i) => {
    const cell = document.createElement('div'); cell.className = 'cell';
    const l = document.createElement('div'); l.className = 'lbl'; l.textContent = CONFIG.evidencePrefix + pad(i + 1);
    const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'RETAKE THIS ONE';
    b.addEventListener('click', () => enterCamera([i]));
    cell.append(l, c, b); grid.append(cell);
  });
}

// ---- Strip composition -----------------------------------------------
// Everything below is drawn with Canvas calls only (no CSS, no external images or fonts),
// so the exported JPG contains the whole frame and works offline.

// Small seeded PRNG: every strip gets its own case ID, hex strings and barcode.
function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const hex = (r, n) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('').toUpperCase();

// Letter-spaced text, drawn per character so every browser tracks identically (booth labels are widely tracked).
function tText(x, s, px, py, size, track, kind, color, align = 'left') {
  x.font = font(kind, size); x.fillStyle = color; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
  const chars = [...s];
  const w = chars.reduce((a, ch) => a + x.measureText(ch).width + track, 0) - track;
  let cx = align === 'center' ? px - w / 2 : align === 'right' ? px - w : px;
  for (const ch of chars) { x.fillText(ch, cx, py); cx += x.measureText(ch).width + track; }
  return w;
}

function chamfer(x, px, py, w, h, c) {       // rectangle with cut corners (HUD silhouette)
  x.beginPath();
  x.moveTo(px + c, py); x.lineTo(px + w - c, py); x.lineTo(px + w, py + c); x.lineTo(px + w, py + h - c);
  x.lineTo(px + w - c, py + h); x.lineTo(px + c, py + h); x.lineTo(px, py + h - c); x.lineTo(px, py + c); x.closePath();
}

function brackets(x, px, py, w, h, L, color, lw) {   // technical corner brackets
  x.strokeStyle = color; x.lineWidth = lw; x.lineCap = 'butt';
  [[px, py, 1, 1], [px + w, py, -1, 1], [px, py + h, 1, -1], [px + w, py + h, -1, -1]].forEach(([cx, cy, dx, dy]) => {
    x.beginPath(); x.moveTo(cx, cy + dy * L); x.lineTo(cx, cy); x.lineTo(cx + dx * L, cy); x.stroke();
  });
}

function cross(x, cx, cy, r, color) {        // small targeting mark
  x.strokeStyle = color; x.lineWidth = 2; x.beginPath();
  x.moveTo(cx - r, cy); x.lineTo(cx + r, cy); x.moveTo(cx, cy - r); x.lineTo(cx, cy + r); x.stroke();
}

function ruler(x, px, y0, y1, dir, color) {  // vertical measurement ticks; dir = +1 (ticks point right) or -1
  x.strokeStyle = color; x.lineWidth = 1.5;
  for (let y = y0, n = 0; y <= y1; y += 12, n++) {
    const len = n % 5 === 0 ? 18 : 8;
    x.beginPath(); x.moveTo(px, y); x.lineTo(px + dir * len, y); x.stroke();
  }
}

async function composeStrip() {
  const S = CONFIG.strip, C = CONFIG.colors, m = S.margin, N = CONFIG.shots;
  const slot = S.labelH + S.photoH + S.gap;
  const W = S.w, H = S.headerH + N * slot + S.footerH;
  // Make sure the bundled Space Grotesk files are loaded before drawing text on the canvas.
  try { await Promise.all([document.fonts.load('700 20px "Space Grotesk"'), document.fonts.load('500 20px "Space Grotesk"')]); } catch (_) {}
  const seed = Date.now(), R = rng(seed);
  const caseId = CONFIG.caseCode + hex(rng(seed), 4);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const FAINT = 'rgba(255,255,255,0.13)', STRONG = 'rgba(255,255,255,0.30)';

  // 1. Atmosphere: the booth's blue / green / navy glows, grid and scan lines
  x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
  const glow = (cx, cy, r, rgba) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); };
  glow(0, 0, W * 1.25, 'rgba(0,180,255,0.24)');
  glow(W, 120, W * 0.9, 'rgba(0,255,140,0.10)');
  glow(W / 2, H, W * 1.1, 'rgba(24,74,148,0.34)');
  for (let g = 0; g <= W; g += 36) { x.strokeStyle = g % 180 === 0 ? 'rgba(46,170,255,0.10)' : 'rgba(255,255,255,0.035)'; x.lineWidth = 1; x.beginPath(); x.moveTo(g, 0); x.lineTo(g, H); x.stroke(); }
  for (let g = 0; g <= H; g += 36) { x.strokeStyle = g % 180 === 0 ? 'rgba(46,170,255,0.10)' : 'rgba(255,255,255,0.035)'; x.beginPath(); x.moveTo(0, g); x.lineTo(W, g); x.stroke(); }
  x.fillStyle = 'rgba(255,255,255,0.02)';
  for (let g = 0; g < H; g += 5) x.fillRect(0, g, W, 1);

  // 2. Layered border: faint outer chamfer, blue inner chamfer, red warning notch
  chamfer(x, 10, 10, W - 20, H - 20, 34); x.strokeStyle = STRONG; x.lineWidth = 2; x.stroke();
  chamfer(x, 24, 24, W - 48, H - 48, 26); x.strokeStyle = C.blue; x.lineWidth = 3; x.stroke();
  x.fillStyle = C.red; x.fillRect(W / 2 - 34, 21, 68, 7);
  x.fillStyle = C.cyan; x.fillRect(W / 2 - 160, 21, 100, 7); x.fillRect(W / 2 + 60, 21, 100, 7);

  // 3. Side rails: measurement ticks with coordinates (kept outside the photo area)
  const railTop = S.headerH + 6, railBot = H - S.footerH - 6;
  ruler(x, 46, railTop, railBot, 1, 'rgba(46,170,255,0.55)');
  ruler(x, W - 46, railTop, railBot, -1, 'rgba(46,170,255,0.55)');
  for (let y = railTop + 120, k = 1; y < railBot - 60; y += 360, k++) {
    [46 - 14, W - 46 + 26].forEach(px => { x.save(); x.translate(px, y); x.rotate(-Math.PI / 2);
      tText(x, `Y ${String(k * 360).padStart(4, '0')}`, 0, 0, 15, 2, 'mono', C.muted, 'center'); x.restore(); });
  }

  // 4. Header
  tText(x, '/CASE FILE', m, 78, 22, 5, 'label', C.muted);
  const sw = tText(x, 'SYSTEM ONLINE', W - m, 78, 22, 4, 'label', C.cyan, 'right');
  x.fillStyle = C.cyan; x.beginPath(); x.arc(W - m - sw - 18, 70, 6, 0, 7); x.fill();
  // title with a subtle glitch slice (cyan/red offset copies inside two thin bands)
  const TY = 184;
  [[132, 10, 6, C.cyan], [156, 6, -6, C.red]].forEach(([by, bh, off, col]) => {
    x.save(); x.beginPath(); x.rect(0, by, W, bh); x.clip();
    tText(x, CONFIG.eventName, m + off, TY, 76, -2, 'head', col); x.restore();
  });
  tText(x, CONFIG.eventName, m, TY, 76, -2, 'head', C.text);
  tText(x, CONFIG.title, m, 232, 29, 7, 'head', C.blue);
  // classified chip
  x.strokeStyle = C.red; x.lineWidth = 2.5; x.strokeRect(W - m - 190, 118, 190, 46);
  x.fillStyle = C.red; x.fillRect(W - m - 174, 136, 11, 11);
  tText(x, CONFIG.stamp, W - m - 150, 148, 20, 4, 'head', C.red);
  // metadata panel
  const my = 268, mh = 58, cw = (W - 2 * m) / 4;
  x.fillStyle = 'rgba(255,255,255,0.03)'; x.fillRect(m, my, W - 2 * m, mh);
  x.strokeStyle = STRONG; x.lineWidth = 1.5; x.strokeRect(m, my, W - 2 * m, mh);
  const meta = [['CASE ID', caseId, C.text], ['DATE UTC', new Date().toISOString().slice(0, 10), C.text],
                ['CLEARANCE', CONFIG.clearance, C.text], ['STATUS', 'SEALED', C.green]];
  meta.forEach(([k, v, col], i) => {
    const cx = m + i * cw + 16;
    if (i) { x.strokeStyle = FAINT; x.beginPath(); x.moveTo(m + i * cw, my + 8); x.lineTo(m + i * cw, my + mh - 8); x.stroke(); }
    tText(x, k, cx, my + 21, 14, 3, 'label', C.muted);
    tText(x, v, cx, my + 46, 21, 1, 'head', col);
  });

  // 5. Evidence slots
  for (let i = 0; i < N; i++) {
    const y0 = S.headerH + i * slot, py = y0 + S.labelH, pw = S.photoW, ph = S.photoH;
    const shot = shots[i];
    tText(x, '/' + CONFIG.evidencePrefix + pad(i + 1), m, y0 + 36, 30, 4, 'head', C.blue);
    tText(x, `${shot ? shot.width + 'x' + shot.height : '----'}  SHA ${hex(R, 10)}`, W - m, y0 + 34, 16, 1, 'mono', C.muted, 'right');
    // photo, then layered borders: inner blue, outer faint offset (both outside the picture's content)
    x.fillStyle = C.panel; x.fillRect(m, py, pw, ph);
    if (shot) x.drawImage(shot, m, py, pw, ph);
    x.strokeStyle = C.blue; x.lineWidth = 3; x.strokeRect(m - 1.5, py - 1.5, pw + 3, ph + 3);
    x.strokeStyle = FAINT; x.lineWidth = 1.5; x.strokeRect(m - 10, py - 10, pw + 20, ph + 20);
    brackets(x, m - 10, py - 10, pw + 20, ph + 20, 44, C.cyan, 5);
    [[m + pw / 2, py - 10], [m + pw / 2, py + ph + 10], [m - 10, py + ph / 2], [m + pw + 10, py + ph / 2]].forEach(([cx, cy]) => cross(x, cx, cy, 9, C.cyan));
    // circuit-style connector to the next slot
    if (i < N - 1) {
      const cy = py + ph + 30;
      x.strokeStyle = 'rgba(46,170,255,0.6)'; x.lineWidth = 2; x.beginPath();
      x.moveTo(m, cy); x.lineTo(m + 70, cy); x.lineTo(m + 86, cy - 8); x.moveTo(W - m, cy); x.lineTo(W - m - 70, cy); x.lineTo(W - m - 86, cy - 8); x.stroke();
      x.fillStyle = C.cyan; [m, W - m].forEach(px => { x.beginPath(); x.arc(px, cy, 4, 0, 7); x.fill(); });
      tText(x, '0x' + hex(R, 20), W / 2, cy + 5, 15, 2, 'mono', C.muted, 'center');
    }
  }

  // 6. Footer
  const F0 = H - S.footerH;
  x.strokeStyle = C.blue; x.lineWidth = 2; x.beginPath(); x.moveTo(m, F0 + 6); x.lineTo(W - m, F0 + 6); x.stroke();
  x.fillStyle = C.cyan; [m, W - m].forEach(px => x.fillRect(px - 5, F0 + 1, 10, 10));
  x.fillStyle = C.green; x.beginPath(); x.arc(W / 2 - 112, F0 + 44, 6, 0, 7); x.fill();
  tText(x, '/STATUS: COMPLETE', W / 2 - 96, F0 + 51, 20, 5, 'label', C.green);
  tText(x, CONFIG.footerTitle, W / 2, F0 + 118, 52, 2, 'head', C.text, 'center');
  // slogan as three segments: STOP (red marker), THINK (outline), VERIFY (filled)
  const words = CONFIG.footerSlogan.split(/\s+/), bw = (W - 2 * m - 30) / 3, by = F0 + 142, bh = 54;
  words.slice(0, 3).forEach((wd, i) => {
    const bx = m + i * (bw + 15), filled = i === 2;
    if (filled) { x.fillStyle = C.blue; x.fillRect(bx, by, bw, bh); }
    else { x.strokeStyle = i === 0 ? C.red : C.blue; x.lineWidth = 2.5; x.strokeRect(bx, by, bw, bh); }
    if (i === 0) { x.fillStyle = C.red; x.fillRect(bx + 14, by + 22, 10, 10); }
    tText(x, wd, bx + bw / 2 + (i === 0 ? 8 : 0), by + 36, 28, 6, 'head', filled ? C.bg : C.text, 'center');
  });
  // fingerprint rings + crosshair (left), signature (center), barcode (right)
  const fy = F0 + 262, fx = m + 52;
  x.strokeStyle = C.blue; x.lineWidth = 2.5;
  for (let r = 8; r <= 44; r += 6) { x.beginPath(); x.arc(fx, fy, r, Math.PI * (0.15 + r / 150), Math.PI * (1.85 - r / 260)); x.stroke(); }
  x.strokeStyle = C.red; x.lineWidth = 2; x.beginPath();
  x.moveTo(fx - 62, fy); x.lineTo(fx - 50, fy); x.moveTo(fx + 50, fy); x.lineTo(fx + 62, fy);
  x.moveTo(fx, fy - 62); x.lineTo(fx, fy - 50); x.moveTo(fx, fy + 50); x.lineTo(fx, fy + 62); x.stroke();
  tText(x, 'DIGITAL SIGNATURE', m + 140, fy - 20, 15, 3, 'label', C.muted);
  tText(x, '0x' + hex(R, 16), m + 140, fy + 4, 19, 1, 'mono', C.text);
  tText(x, 'BSIS 2C // PHOTO EVIDENCE', m + 140, fy + 30, 15, 2, 'label', C.cyan);
  let bx = W - m - 190; x.fillStyle = C.text;
  while (bx < W - m) { const bw2 = 2 + Math.floor(R() * 4); x.fillRect(bx, fy - 34, bw2, 68); bx += bw2 + 2 + Math.floor(R() * 3); }
  // ticker, same pattern as the booth site
  tText(x, CONFIG.ticker, W / 2, H - 52, 16, 3, 'label', C.muted, 'center');

  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('export failed')), 'image/jpeg', S.quality));
}

async function generate() {
  const btn = $('btn-generate'); btn.disabled = true; btn.textContent = 'BUILDING...';
  try {
    if (stripUrl) URL.revokeObjectURL(stripUrl);
    stripBlob = await composeStrip();
    stripUrl = URL.createObjectURL(stripBlob);
    $('strip-img').src = stripUrl;
    $('dl-note').textContent = '';
    $('ios-note').hidden = !isIOS;
    show('s-done');
  } catch (e) {
    alert('Could not create the photo strip. Please try again.');
  } finally { btn.disabled = false; btn.textContent = 'CREATE PHOTO STRIP'; }
}

// ---- Download ---------------------------------------------------------
async function download() {
  const note = $('dl-note');
  if (!stripBlob) return;
  try {
    // iOS Safari often ignores the download attribute; the share sheet offers Save Image.
    const file = new File([stripBlob], CONFIG.filename, { type: 'image/jpeg' });
    if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = stripUrl; a.download = CONFIG.filename;
    document.body.appendChild(a); a.click(); a.remove();
    note.textContent = isIOS ? 'If nothing saved, press and hold the image and choose Add to Photos.' : 'Download started. Check your Downloads folder.';
  } catch (e) {
    note.textContent = 'Download failed. Press and hold the image to save it.';
  }
}

// ---- New session: release everything ---------------------------------
function newSession() {
  cancelRun(); stopCamera();
  if (stripUrl) { URL.revokeObjectURL(stripUrl); stripUrl = null; }
  stripBlob = null; $('strip-img').removeAttribute('src');
  shots = Array(CONFIG.shots).fill(null);
  $('review-grid').textContent = '';
  show('s-welcome');
}

// ---- Wiring -------------------------------------------------------------
$('btn-start').addEventListener('click', () => enterCamera([0, 1, 2]));   // permission asked only after this tap
$('btn-begin').addEventListener('click', runCapture);
$('btn-retry').addEventListener('click', async () => { resetCaptureUI(); await startCamera(); });
$('btn-switch').addEventListener('click', async () => { facing = facing === 'user' ? 'environment' : 'user'; await startCamera(); });
$('btn-cancel').addEventListener('click', () => {
  cancelRun(); stopCamera();
  if (shots.every(Boolean)) { renderReview(); show('s-review'); } else newSession();
});
$('btn-retake-all').addEventListener('click', () => enterCamera([0, 1, 2]));
$('btn-generate').addEventListener('click', generate);
$('btn-download').addEventListener('click', download);
$('btn-new').addEventListener('click', newSession);
window.addEventListener('pagehide', stopCamera);

// ---- PWA: register SW; show OFFLINE READY only after the cache really holds the shell ----
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(async () => {
    const c = await caches.open(CONFIG.cacheName);
    if (await c.match('./index.html')) $('offline-badge').hidden = false;
  }).catch(() => {});
}
