# GigMate Scheduler - Setup & Usage Guide

## ✅ What's Been Fixed

Your app had several issues preventing it from loading:

### 1. **Missing Firebase Configuration**
- **Problem**: App crashed on startup because `.env.local` was missing
- **Solution**: Created `.env.local` with template Firebase values
- **Action**: Add your real Firebase API keys to `.env.local` to enable cloud features

### 2. **Poor Error Handling**
- **Problem**: Firebase errors would crash the app silently
- **Solution**: Added graceful error handling with helpful error screens
- **Now**: App shows setup instructions if Firebase isn't configured

### 3. **Simplified UI**
- **Problem**: Login and onboarding screens were overcomplicated
- **Solution**: Redesigned with cleaner layout and better UX
- **Now**: Users can quickly understand what to do

### 4. **Demo Mode Available**
- **Problem**: Couldn't test without real Firebase credentials
- **Solution**: Added demo mode to test all features
- **Now**: Click "Load Demo" on the setup screen to try the app

---

## 🚀 Quick Start

### Option 1: Demo Mode (Test Without Firebase)
1. `npm install`
2. `npm run dev`
3. Wait for "Setup Required" screen
4. Click **"Load Demo"** button
5. Explore the app with sample data

### Option 2: Real Firebase Setup (Full Features)
1. `npm install`
2. Get Firebase credentials:
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Create a new project or use existing one
   - Copy credentials from Project Settings
3. Edit `.env.local`:
   ```
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=1:your_id:web:your_web_id
   VITE_FIRESTORE_DATABASE_ID=(default)
   ```
4. `npm run dev`
5. Sign in with Google

---

## 📱 App Features

### **Schedule**
- View team schedules
- Create shifts for yourself or team members
- Drag to select time slots
- Assign tasks to team members

### **Chat**
- Real-time team messaging
- Discuss shifts and updates
- See message history

### **Earnings**
- Track income
- View split payments
- See earning reports
- Manage expenses

### **Mileage**
- Track trips with GPS
- Calculate tax deductions
- View mileage history
- Auto-calculate distances

### **Admin Settings** (Team Leaders)
- Manage team members
- Customize categories
- Adjust split pay percentage
- Control team features

---

## 💡 How to Use

### **First Time Setup**

1. **Sign in** with Google (or load demo)
2. **Create Team** or **Join Team**:
   - If you're the leader → Create a team
   - If you're joining → Get code from leader
3. **Enter your name** and proceed
4. **Invite team members** by sharing the Team Code

### **Daily Workflow**

1. **Schedule shifts** - Click calendar slots to create assignments
2. **Chat with team** - Update everyone on progress
3. **Track earnings** - Log income from gigs
4. **Record miles** - Start/stop trip tracking for mileage
5. **Check admin panel** - Approve shift requests (leaders only)

### **Team Collaboration**

- **Members** can request time off or shift changes
- **Leaders** can approve/deny requests
- **Everyone** can see the team schedule
- **Chat** keeps everyone in sync

---

## 🔧 Troubleshooting

### App Won't Load
- Check if `.env.local` exists
- Try **"Load Demo"** to verify app works
- Check browser console for errors (F12)

### Can't Sign In
- Make sure Firebase API key is valid in `.env.local`
- Check if "Sign in with Google" is enabled in Firebase Console
- Try signing out and back in

### Teams Not Syncing
- Wait 2-3 seconds for Firebase to sync
- Check internet connection
- Refresh the page

### Shift Changes Aren't Showing
- They sync every 2-3 seconds
- Try refreshing if stuck
- Check that Firebase connection is active

---

## 🛠️ Development

### Run Development Server
```bash
npm run dev
```
Access at `http://localhost:3000`

### Build for Production
```bash
npm run build
npm start
```

### Check for Errors
```bash
npm run lint
```

---

## 📝 Technical Notes

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Backend**: Express.js (Node.js)
- **Database**: Firebase Firestore
- **Auth**: Google OAuth
- **PWA**: Service worker enabled
- **Deploy**: Vite + Express

---

## ✨ What's New

✅ Firebase config now optional - demo mode works without it  
✅ Better error screens with helpful instructions  
✅ Simplified login flow  
✅ Improved onboarding experience  
✅ Cleaner UI with better spacing  
✅ Loading states show what's happening  
✅ Better mobile responsive design  

---

## 🎯 Next Steps

1. **Test demo mode** to verify everything works
2. **Set up Firebase** for real team collaboration
3. **Invite team members** with the team code
4. **Start scheduling shifts** together
5. **Track earnings and miles** during gigs

---

## 📞 Support

If you encounter issues:
1. Check the browser console (F12 → Console tab)
2. Try the demo mode first
3. Verify Firebase credentials are correct
4. Clear browser cache and reload

Happy scheduling! 🚀
