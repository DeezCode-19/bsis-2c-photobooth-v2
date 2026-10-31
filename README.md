# CYBER BOOTH // BSIS 2C

A retro pixel-art cybersecurity photobooth built with plain HTML, CSS, and JavaScript. Take three photos with a 3-second countdown, retake one shot or all three, then download a complete 1080 × 3256 evidence strip as a JPG.

Everything runs in the browser. There is no backend, database, login, cloud upload, or npm dependency.

---

## What it does

1. **Start the investigation** — asks for camera permission and opens the live camera preview.
2. **Take three photos** — each shot has a 3-2-1 countdown and a flash.
3. **Review the evidence** — retake a single photo, or retake all three. Photos that are not retaken are kept.
4. **Create the strip** — draws the entire pixel-art frame, photos, labels, metadata, barcode, and footer on a Canvas.
5. **Download the JPG** — the preview and the downloaded file are the same JPEG blob, so they match exactly.
6. **Work offline** — after one successful online visit, the app shell is cached by a service worker.

### Main features

- Pixel fonts bundled locally: **Press Start 2P** for headings and **VT323** for body text.
- Chunky black outlines, white sticker borders, colourful pixel shadows, arcade buttons, and retro-computer cards.
- Pixel-art SVG logo, favicon, and UI icons.
- Camera preview mirrored for the front camera, including the saved photo, so the result matches what you saw.
- Camera zoom uses the track's hardware zoom when supported; otherwise visual preview zoom crops the saved photo to match.
- Responsive desktop, tablet, and phone layouts.
- Local-only photo processing using `<video>`, `<canvas>`, and `Blob` URLs.
- PWA manifest and service worker for installability and offline use.
- Vercel-ready static configuration with camera permission and service-worker headers.
- Accessible basics: skip link, focus outlines, ARIA labels/live regions, reduced-motion support, and keyboard-operable buttons.

---

## Technologies used

| Technology | Purpose |
|---|---|
| HTML5 | Page structure and screens |
| CSS3 | Pixel-art design system, responsive layout, animations |
| Vanilla JavaScript | Camera, capture, review, Canvas strip rendering, download |
| MediaDevices / `getUserMedia` | Live camera stream |
| Canvas 2D | Crop photos and draw the complete exported strip |
| Blob + object URLs | Preview and download the JPG without uploading it |
| Service Worker + Cache API | Offline app shell |
| Web App Manifest | Installable PWA metadata |
| Vercel | Static hosting and security headers |

No frameworks, no bundler, no package manager, and no external CDN resources are required.

---

## Project structure

```text
school-photobooth/
├─ index.html
├─ style.css
├─ app.js
├─ manifest.json
├─ sw.js
├─ vercel.json
├─ server.js
├─ README.md
└─ assets/
   ├─ favicon.svg
   ├─ logo.svg
   ├─ icon-192.png
   ├─ icon-512.png
   ├─ fonts/
   │  ├─ press-start-2p-latin-400-normal.woff2
   │  ├─ vt323-latin-400-normal.woff2
   │  ├─ OFL-PressStart2P.txt
   │  └─ OFL-VT323.txt
   └─ icons/
      ├─ alert.svg
      ├─ camera.svg
      ├─ check.svg
      ├─ chevron-left.svg
      ├─ download.svg
      ├─ lock.svg
      ├─ refresh.svg
      ├─ shield.svg
      ├─ spark.svg
      └─ wifi-off.svg
```

### Important files

- **`index.html`** — all five screens: welcome, camera, review, finished strip, and the shared header/footer.
- **`style.css`** — the full pixel-art design, responsive rules, fonts, buttons, cards, and animations.
- **`app.js`** — the `CONFIG` object, camera lifecycle, countdown, capture, retakes, Canvas strip renderer, download logic, and service-worker registration.
- **`sw.js`** — the precache list and offline fetch strategy.
- **`manifest.json`** — PWA name, icons, theme colours, and display settings.
- **`vercel.json`** — static-host headers, including `Permissions-Policy: camera=(self)` and no-cache for `sw.js`.
- **`server.js`** — optional zero-dependency local development server. It is not used by the deployed site and is not precached by the service worker.

---

## Run it locally

You need a local web server. **Do not double-click `index.html`.** Opening it with `file://` prevents the camera and service worker from working correctly.

### Option 1: Node.js (recommended here)

The project includes `server.js`, a tiny zero-dependency static server. Node.js is already available in this workspace.

Open a terminal in the `school-photobooth` folder:

```powershell
cd "C:\Users\aldis\OneDrive\Documents\Default Project\school-photobooth"
node server.js
```

Then open:

```text
http://localhost:8000/
```

If port 8000 is busy, choose another port:

```powershell
$env:PORT=8010; node server.js
```

On macOS / Linux:

```bash
PORT=8010 node server.js
```

`server.js` is only a development convenience. Vercel serves the static files directly; `server.js` is not used in production and is not cached by the service worker.

### Option 2: Python (if installed)

Open a terminal in the `school-photobooth` folder.

Windows PowerShell:

```powershell
cd "C:\Users\aldis\OneDrive\Documents\Default Project\school-photobooth"
py -m http.server 8000
```

If `py` is not available, try:

```powershell
python -m http.server 8000
```

macOS / Linux:

```bash
cd path/to/school-photobooth
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

### Option 3: VS Code Live Server

1. Open the `school-photobooth` folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `index.html` and choose **Open with Live Server**.

### Option 4: Any static server

Any server that serves this folder over HTTP works. There is no build command.

```text
http://localhost:8000/     ← example
```

### Why localhost?

Browsers only allow camera access in a **secure context**:

- `http://localhost`
- `http://127.0.0.1`
- an HTTPS site such as Vercel

A plain `http://192.168.x.x` address on your Wi-Fi is usually **not** a secure context, so phone camera access may be blocked. For real-phone testing, deploy to Vercel or use an HTTPS tunnel.

---

## Test the camera on localhost

1. Start the local server and open `http://localhost:8000/`.
2. Click **START INVESTIGATION**.
3. When the browser asks for camera permission, choose **Allow**.
4. You should see the live preview inside the framed stage.
5. Try the zoom slider and the `−` / `+` buttons. The label identifies hardware zoom or visual-only zoom.
6. Click **START COUNTDOWN**. You should see `3`, `2`, `1`, a flash, and then the review screen after all three photos.

### If the camera is blocked

- Click the lock/camera icon in the address bar and set **Camera** to **Allow**, then reload.
- On iPhone: **Settings → Safari → Camera → Allow**.
- On Android Chrome: **Site settings → Permissions → Camera → Allow**.
- Close other apps that may be using the camera.
- Make sure you are on `localhost` or HTTPS, not a plain LAN IP.
- The app shows a readable error and a **TRY CAMERA AGAIN** button. The retry path is implemented and was tested with a synthetic camera.

### Testing on a real phone

Because phone cameras need HTTPS, the easiest options are:

1. Deploy to Vercel and open the HTTPS URL on the phone, or
2. Use an HTTPS tunnel such as Cloudflare Tunnel or ngrok while the local server is running.

Do not add a tunnel or deployment dependency to the project itself; those are only testing tools.

---

## How the photo flow works

### Camera preview

- `navigator.mediaDevices.getUserMedia({ video: ..., audio: false })` requests only the camera. The microphone is never requested.
- The preview is mirrored for the front-facing camera.
- The stage uses the same 900:700 aspect ratio as the photo slots in the strip, so the preview crop and saved crop match.
- Zoom reads the track's `getCapabilities()` and `getSettings()` values, then applies supported hardware levels with `applyConstraints()`.
- If hardware zoom is not exposed or cannot be applied, CSS scales the centered preview; `grab()` uses the same centered crop for the saved photo.
- Zoom returns to the new camera's default when the camera is restarted or switched. Hardware zoom availability depends on the device and browser; visual zoom is not optical zoom.

### Capture

- Each shot waits 900 ms for the first shot (or 1200 ms for later shots), then counts down `3 → 2 → 1`.
- `grab()` crops the current video frame to 900:700 without stretching it and renders it to a 1170 × 910 canvas.
- Photos are held in memory as canvases. Nothing is sent over the network.
- If a capture is cancelled or interrupted, the old committed photos are not overwritten.

### Review and retakes

- **RETAKE THIS ONE** captures a new photo only for that slot.
- **RETAKE ALL** captures three new photos and replaces all three.
- The other photos remain untouched during a single retake.
- **CREATE PHOTO STRIP** is enabled only when all three photos exist.

### Strip composition

The exported JPG is drawn entirely with Canvas calls in `app.js`:

- 1080 px wide, 3256 px tall by default.
- White sticker frame, thick black outlines, pink offset shadow, pixel grid, stars, and glow.
- Pixel shield logo, case metadata, evidence labels, SHA-style strings, photo frames, hazard stripe, slogan blocks, signature, barcode, and ticker.
- Photos are drawn from the in-memory canvases, not from remote images, so the export works offline.
- The preview uses a Blob URL created from the same `stripBlob` that the download button uses. The automated test compared SHA-256 hashes of the preview and downloaded file and they matched.

### Download

- Desktop and Android browsers use an `<a download>` link with the filename `BSIS2C-Cyber-Booth-Photo-Evidence.jpg`.
- On iPhone, the app first tries the Web Share API with the JPEG file so the share sheet can offer **Save Image**. If sharing is unavailable or fails, it falls back to the download link and shows a long-press hint.
- The downloaded image is 1080 × 3256 pixels at JPEG quality `0.94`.

---

## Offline mode and the service worker

The app precaches its HTML, CSS, JavaScript, manifest, fonts, icons, logo, and favicon. The cache is named:

```text
bsis2c-photobooth-v5
```

### Test offline mode

1. Load the app online once at `http://localhost:8000/` or the deployed HTTPS URL.
2. Wait for the **OFFLINE READY** badge under the welcome card.
3. Open DevTools → **Application** → **Service Workers** and confirm the worker is activated.
4. In DevTools → **Network**, choose **Offline**.
5. Reload the page. The welcome screen, fonts, camera flow, and strip generation should still work.

The automated test also ran a complete capture and strip generation with the browser context set offline.

### Updating the cache

When you change **any** cached file, bump the version in **both** places so returning visitors get the new files:

1. `sw.js`:
   ```js
   const CACHE = 'bsis2c-photobooth-v6';
   ```
2. `app.js`:
   ```js
   cacheName: 'bsis2c-photobooth-v6'
   ```

They must match. If you forget, the old cache can keep serving the old design.

### Notes

- The service worker only runs on `localhost` or HTTPS.
- It caches same-origin GET requests and uses a cache-first strategy.
- Camera streams and photos are never cached; they exist only in memory.
- The OFL license text files are not part of the app shell precache, because the app does not need them to run. They are included in the project for license compliance.

---

## Deploy to Vercel

This is a static site. No build step, server, environment variables, database, or API routes are needed.

### Dashboard method

1. Put the project in a GitHub, GitLab, or Bitbucket repository.
2. In Vercel, choose **Add New → Project** and import the repository.
3. Set **Framework Preset** to **Other**.
4. Leave **Build Command** empty.
5. Set **Output Directory** to `.` (or leave it empty/default for a root static site).
6. Click **Deploy**.
7. Open the HTTPS deployment URL on desktop and phone.

### CLI method

If you already have Node.js and Vercel CLI:

```powershell
cd "C:\Users\aldis\OneDrive\Documents\Default Project\school-photobooth"
npx vercel
npx vercel --prod
```

Follow the prompts. No build command is required.

### Included Vercel configuration

`vercel.json` adds:

- `Permissions-Policy: camera=(self)` so the same origin can request the camera.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `X-Frame-Options: DENY`.
- `Cache-Control: no-cache, no-store, must-revalidate` for `sw.js`.

HTTPS is provided by Vercel, which is required for camera access on real phones.

> This project was prepared and validated locally. It has **not** been deployed to a live Vercel account from this workspace. The static structure and `vercel.json` are ready for deployment.

---

## Privacy and permissions

- The app requests **camera only**. It never requests the microphone.
- Photos are stored in JavaScript memory and as browser Blob URLs.
- There is no upload request, backend, analytics, account, or tracking script.
- Closing the tab discards the in-memory photos. The downloaded JPG stays wherever your browser saves it.
- The only network requests are for the app's own static files.
- The service worker caches the app shell; it does not cache camera frames or photos.
- If you host this on a third-party server, that host can still see normal static-file requests. The app itself does not send the photos anywhere.

---

## Customise the booth

Most text and strip colours live in the `CONFIG` object at the top of `app.js`.

### Change text

```js
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
  // ...
};
```

Some welcome-screen copy is written directly in `index.html`. Elements with `data-cfg="..."` are updated automatically from `CONFIG` on page load.

### Change colours

- Page colours: CSS variables at the top of `style.css` (`--lime`, `--cyan`, `--pink`, etc.).
- Strip colours: `CONFIG.colors` in `app.js`.

Keep the two palettes reasonably in sync if you want the preview and the exported strip to feel like the same design.

### Change fonts

1. Put the new `.woff2` file in `assets/fonts/`.
2. Update the `@font-face` rules in `style.css`.
3. Update the two `<link rel="preload">` tags in `index.html`.
4. Update `CONFIG.fonts` in `app.js` if the family names change.
5. Add the new font file to the `ASSETS` list in `sw.js`.
6. Bump the cache version in both `sw.js` and `app.js`.

The included fonts are under the SIL Open Font License. Their license files are in `assets/fonts/`.

### Change the strip layout

The strip geometry is in `CONFIG.strip`:

```js
strip: {
  w: 1080, margin: 90, photoW: 900, photoH: 700,
  labelH: 64, gap: 48, headerH: 440, footerH: 380, quality: 0.94
}
```

The total height is calculated as:

```text
headerH + shots × (labelH + photoH + gap) + footerH
```

For the default values that is `1080 × 3256`.

The drawing functions in `app.js` use some fixed pixel positions for the header, footer, barcode, and labels. If you change the width, height, margins, or photo size significantly, re-check those positions and test the downloaded JPG. For a first customisation, changing text and colours is the safest option.

### Change the number of photos

The app is designed around three photos. If you change `CONFIG.shots`, also:

- Add or remove the matching `<i>` elements inside `#dots` in `index.html`.
- Update copy that says "three shots" if needed.
- Test the review grid, strip height, and download on mobile and desktop.

The strip height formula and review grid are dynamic, but the dots markup is fixed.

### Update the cache version

Every time you change a cached file:

```text
sw.js  → const CACHE = 'bsis2c-photobooth-v6';
app.js → cacheName: 'bsis2c-photobooth-v6'
```

Use the same new version string in both files.

---

## Troubleshooting

| Problem | What to check |
|---|---|
| Camera permission never appears | Use `http://localhost` or HTTPS. A plain LAN IP is not a secure context. Check browser site permissions. |
| "Camera access was blocked" | Click the lock/camera icon in the address bar and allow camera access. On iPhone: Settings → Safari → Camera. Then press **TRY CAMERA AGAIN**. |
| "No camera was found" | Connect a camera or try another device. Close virtual-camera apps that may confuse the browser. |
| "The camera is being used by another app" | Close Zoom, Teams, OBS, or any other app using the camera, then retry. |
| Preview is black | Wait a moment for the camera to warm up, check the browser permission, and try **TRY CAMERA AGAIN**. Some laptops have a physical camera shutter. |
| Download does not start on iPhone | The app tries the share sheet first. Choose **Save Image**, or press and hold the preview image and choose **Add to Photos**. The ordinary download fallback is implemented and tested with sharing stubbed out. |
| Old design keeps loading | Bump both cache versions, reload, and if necessary unregister the old service worker in DevTools → Application → Service Workers. |
| OFFLINE READY badge does not appear | Load once online, wait for the service worker to install, then reload. Check DevTools → Application → Cache Storage. |
| Fonts look like a fallback monospace | Confirm both `.woff2` files exist and are served over HTTP. Check the Network panel for 404s. |
| Strip preview is blank | Check the browser console for errors. The app needs Canvas 2D and `canvas.toBlob` support. |
| Offline mode does not work on a phone | Service workers require HTTPS (or localhost). Use the Vercel HTTPS URL. |

---

## Browser support

The app targets current versions of:

- Chrome / Edge on desktop and Android
- Safari on iPhone and iPad
- Firefox on desktop

It relies on modern browser features: `getUserMedia`, Canvas 2D, `canvas.toBlob`, Blob URLs, service workers, and CSS `dvh` units. Very old browsers may show a fallback layout or fail to open the camera.

### Accessibility

- Skip link to the main content.
- Visible `:focus-visible` outlines on buttons.
- ARIA live regions for the countdown and progress.
- Camera errors use `role="alert"`.
- Decorative images are marked `aria-hidden` or have empty `alt` text.
- `prefers-reduced-motion` disables animations.
- The app has not been audited with a screen reader; that is a good next step if accessibility is a grading requirement.

---

## Verification notes

This project was checked locally with **Playwright Core + Microsoft Edge** using an animated synthetic canvas stream as the camera. The test covered:

- Local font loading and no horizontal overflow.
- Welcome → camera → 3-2-1 countdown → three captures → review.
- Single-photo retake (only that photo changed).
- Retake all (all three photos changed).
- Strip preview at 1080 × 3256.
- JPG download at 1080 × 3256 with the expected filename.
- SHA-256 equality between the preview blob and the downloaded file.
- Service-worker cache with 21 entries and an active controller.
- Offline reload, plus a complete offline capture and strip generation.
- Mobile viewport emulation at 390 × 844 with no overflow.
- Mobile download fallback at 1080 × 3256.
- Camera permission denial, readable error, and successful retry after restoring a working camera.
- A separate 320 × 568 viewport check confirmed the permission error overlay keeps its **TRY CAMERA AGAIN** button inside the stage and clickable on a very small phone.
- No console errors, page errors, failed requests, or HTTP 4xx responses in the automated run.

### Limitations

- **No physical camera was available.** Real camera framing, focus, lighting, mirroring on specific phones, and camera quality were not tested on hardware.
- **No real iPhone was available.** The iOS Web Share path is implemented, but the actual iOS share sheet and “Save Image” behaviour were not tested. The test stubbed out sharing to exercise the download fallback.
- **No real-device PWA installation** was performed.
- **No live Vercel deployment** was performed from this workspace. The static configuration is included and validated.
- The test used a synthetic MediaStream, not a webcam.

These limitations are stated so the project is not described as tested on hardware when it was not.

---

## Credits and licenses

- **Press Start 2P** — CodeMan38, SIL Open Font License 1.1. License: `assets/fonts/OFL-PressStart2P.txt`.
- **VT323** — Peter Hull, SIL Open Font License 1.1. License: `assets/fonts/OFL-VT323.txt`.
- Pixel logo, favicon, and UI icons are custom SVG assets included in this project.
- Built for the BSIS 2C cybersecurity photobooth.

The project code is provided as a student project. No separate code license is declared here; add one if you plan to publish or redistribute the code.
