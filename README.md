# GigMate Scheduler

GigMate is a PWA-ready scheduling, team chat, mileage, and earnings tracker for gig-work teams.

## Run locally

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Create a local `.env.local` from `.env.example` and fill in the rotated Firebase web config values.

4. Build and run the production app:
   ```bash
   npm run build
   npm start
   ```

The local production URL is `http://localhost:3000`.

## PWA status

The app includes:

- `public/manifest.json` for install metadata.
- `public/icon-192.png`, `public/icon-512.png`, and `public/apple-touch-icon.png` for install icons.
- `public/sw.js` for app-shell and same-origin asset caching.
- Service worker registration in `src/main.tsx`.
- Mobile web app tags in `index.html`.
- Static host config for Netlify, Vercel, and Firebase Hosting.

After deployment, verify installability with Chrome DevTools Lighthouse and the Application tab. PWAs require HTTPS in production.

## Publish plan

1. Confirm Firebase is ready:
   - Lock Firestore rules to the current `firestore.rules`.
   - Restrict Firebase auth domains to the deployed domain.
   - Revoke the leaked Firebase web API key and create a rotated key.
   - Restrict the rotated Firebase API key by HTTP referrer after the domain is known.

2. Build the app:
   ```bash
   npm run lint
   npm run build
   ```

3. Deploy as a static PWA.

   Netlify:
   - `netlify.toml` is already configured.
   - Build command: `npm run build`.
   - Publish directory: `dist`.
   - Add the `VITE_FIREBASE_*` and `VITE_FIRESTORE_DATABASE_ID` values from Firebase in Site configuration > Environment variables. `.env.example` only contains placeholder names.

   Vercel:
   - `vercel.json` is already configured.
   - Framework preset: Vite.
   - Output directory: `dist`.

   Firebase Hosting:
   - `firebase.json` is already configured.
   - Run `firebase deploy --only hosting,firestore:rules` after selecting the Firebase project.

4. Add a custom domain and HTTPS.

5. Verify:
   - Open the deployed URL.
   - Check login, team creation/joining, schedule CRUD, chat, earnings, and mileage start/stop.
   - Run Lighthouse PWA checks.
   - Install from Chrome or Edge, then test launch from the installed app.

## Notes

The Express server is useful for local production testing and health checks. The current frontend talks directly to Firebase, so static hosting is enough for the published PWA unless you later add private server-side APIs.
