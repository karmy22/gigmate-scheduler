Prerequisites:

- Install Firebase CLI and authenticate: `npm install -g firebase-tools` then `firebase login`.
- Ensure a Firebase project is created and configured (Hosting, Firestore, Authentication, Cloud Messaging, Functions).
- Copy `.env.example` to `.env.local` and fill in your VITE_FIREBASE_* values before running `npm run build`.

Local development:

1. Install root deps: `npm install`
2. Run dev server: `npm run dev`

Build & deploy (production):

1. Build the client and server bundle: `npm run build`
2. Deploy hosting, firestore rules, and functions: `npm run deploy`

Notes:

- The `functions` folder contains a minimal HTTP function `sendTestNotification` for FCM testing.
- Add your FCM server key and authorized domains in the Firebase Console if using Messaging in production.
- For CI builds, provide the same `VITE_*` env variables to the build environment so the client is built with proper Firebase config.
