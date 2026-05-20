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

3. Create a local `.env.local` from `.env.example` and fill in the Firebase web config values as `VITE_*` variables. Vite only reads environment variables with that prefix.

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
- Firebase Hosting config in `firebase.json`.

After deployment, verify installability with Chrome DevTools Lighthouse and the Application tab. PWAs require HTTPS in production.

## Publish plan

1. Confirm Firebase is ready:
   - Install and sign in to the Firebase CLI.
   - Confirm `.firebaserc` points at the correct project: `scheduling-app-4b7aa`.
   - Lock Firestore rules to the current `firestore.rules`.
   - In Firebase Console > Authentication > Settings > Authorized domains, include `localhost`, `scheduling-app-4b7aa.firebaseapp.com`, and any custom domain.
   - Revoke the leaked Firebase web API key and create a rotated key.
   - Restrict the rotated Firebase API key by HTTP referrer after the domain is known.

2. Build the app:
   ```bash
   npm run lint
   npm run build
   ```

3. Deploy to Firebase Hosting.

   - `firebase.json` is already configured.
   - Build locally with `.env.local` present.
   - Run `npm run deploy` to build, publish Hosting, and deploy Firestore rules.
   - Run `npm run deploy:preview` to create a Firebase Hosting preview channel first.
   - If you build in CI, add the same `VITE_FIREBASE_*` values to that CI environment before the build runs.

4. Add a custom domain and HTTPS.

5. Verify:
   - Open the deployed URL.
   - Check login, team creation/joining, schedule CRUD, chat, earnings, and mileage start/stop.
   - Run Lighthouse PWA checks.
   - Install from Chrome or Edge, then test launch from the installed app.

## Notes

The Express server is useful for local production testing and health checks. The current frontend talks directly to Firebase, so static hosting is enough for the published PWA unless you later add private server-side APIs.
