# BSIS 2C Cybersecurity Photobooth

Vanilla HTML/CSS/JS PWA. Photos are captured and composed on the visitor's device and never uploaded.

## Run locally
Camera access needs HTTPS or localhost.
    cd school-photobooth
    python3 -m http.server 8080
Open http://localhost:8080. To test on a phone, deploy to Vercel (below) or use a tunnel that gives you an HTTPS URL.

## Deploy to Vercel
1. Push the folder to a GitHub repo (or run `npx vercel` inside it).
2. In Vercel: Add New > Project > import the repo. Framework Preset: Other. No build command, output directory `.`.
3. Deploy. Open the `https://...vercel.app` URL once on each phone while online so the offline cache fills.
When you change any file, bump `CACHE` in `sw.js` and `CONFIG.cacheName` in `app.js` (for example `-v2`).

## QR code for the website
Use any QR generator (for example qr-code-generator.com, or `npx qrcode "https://YOUR-SITE.vercel.app" -o booth-qr.png`) and print it at the booth. Test-scan it before printing.

## Rebranding
Edit the `CONFIG` object at the top of `app.js` (text, colors, fonts, strip layout). The frame uses a typographic BSIS 2C mark, because the booth site has no logo file..

## Mobile test checklist
- Loads on Android Chrome and iPhone Safari without horizontal scroll
- Permission prompt appears only after tapping START INVESTIGATION; denying shows recovery steps
- Countdown 3-2-1, flash, three photos in order (EVIDENCE 01/02/03)
- Switch camera works; Cancel turns the camera light off
- Retake one photo keeps the other two; retake all works
- Downloaded JPG has all three photos, full frame, correct orientation, no stretched faces
- iPhone: share sheet or long-press saves the image
- New investigation clears the previous photos
- Airplane mode after one online visit: app still opens and works

## Known limitations
- Not run on real phones here. Please complete the checklist above before the event.
- Cache-first service worker: returning visitors need a cache-version bump to see updates.
- iOS Safari can ignore direct downloads; the share sheet is used as a fallback.
- Camera behavior differs inside in-app browsers (Messenger, Instagram); ask visitors to open the link in Chrome or Safari.
- Browsers manage memory themselves; the app releases photos and Blob URLs but cannot guarantee instant wipe.

## Frame redesign notes
- Palette comes from the booth site `style.css`: #050505 background, #eef1ee ink, #2eaaff blue, #00d4ff cyan, #ff4d4d red, plus the site's green and navy glows.
- The whole frame is drawn with Canvas (no external images or fonts). Space Grotesk is bundled locally in assets/fonts.
- Cache version is now `v4` in both `sw.js` and `CONFIG.cacheName`.
