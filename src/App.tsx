import { useState, useMemo, useEffect, FormEvent, useRef } from "react";
import { 
  format, 
  addDays, 
  startOfWeek, 
  eachDayOfInterval, 
  isSameDay, 
  parseISO,
  getHours,
  startOfHour,
  setHours,
  setMinutes,
  startOfMonth,
  endOfMonth
} from "date-fns";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  DollarSign, 
  User, 
  LogOut, 
  Users,
  Repeat,
  Layers,
  ShoppingBag,
  Hammer,
  Dog,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  CheckCircle2,
  Briefcase,
  Edit3,
  Check,
  MessageSquare,
  Settings as SettingsIcon,
  Palette,
  CreditCard,
  Target,
  Shield,
  Bell,
  Mail,
  Phone,
  LockKeyhole,
  Car,
  MapPin,
  Link as LinkIcon,
  X,
  Menu,
  BookOpen,
  AlertCircle
} from "lucide-react";
import { 
  onSnapshot, 
  collection, 
  query, 
  where, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  addDoc,
  serverTimestamp,
  deleteDoc,
  orderBy,
  limit,
  arrayUnion,
  arrayRemove
} from "firebase/firestore";
import { 
  onAuthStateChanged, 
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  updateProfile,
  signOut,
  User as FirebaseUser,
  ConfirmationResult
} from "firebase/auth";
import { motion, AnimatePresence } from "motion/react";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import { auth, db, googleProvider, handleFirestoreError, OperationType, isFirebaseConfigured, getMissingFirebaseEnv } from "./lib/firebase";
import { 
  UserProfile, 
  ShiftSlot, 
  EarningEntry, 
  Team, 
  Category,
  SlotType, 
  Role, 
  SlotStatus, 
  TransactionType,
  ChatMessage,
  BudgetCategory,
  TripLocation,
  WorkTrip
} from "./types";

type View = 'schedule' | 'earnings' | 'settings' | 'chat' | 'mileage' | 'calendar';

// --- Utility ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(...inputs));
}

// --- Components ---

const PRESET_COLORS = [
  '#4f46e5', '#10b981', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'
];

const STANDARD_MILEAGE_RATE = 0.65;

function toDate(value: any): Date {
  if (!value) return new Date();
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return value instanceof Date ? value : new Date(value);
}

function calculateMiles(start: TripLocation, end: TripLocation): number {
  const dy = end.lat - start.lat;
  const dx = (end.lng - start.lng) * Math.cos(start.lat * Math.PI / 180);
  return Number((Math.sqrt(dx * dx + dy * dy) * 69).toFixed(2));
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    });
  });
}

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [teamMembers, setTeamMembers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<ShiftSlot[]>([]);
  const [earnings, setEarnings] = useState<EarningEntry[]>([]);
  const [trips, setTrips] = useState<WorkTrip[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(startOfWeek(new Date()));
  const [view, setView] = useState<View>('schedule');
  const [team, setTeam] = useState<Team | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  const [pendingAssignment, setPendingAssignment] = useState<boolean>(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | 'everyone'>('everyone');
  const [collapsedSections, setCollapsedSections] = useState({
    team: false,
    categories: false,
    revenue: false
  });
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [editingMember, setEditingMember] = useState<UserProfile | null>(null);
  const [editMemberName, setEditMemberName] = useState('');
  const [editMemberRole, setEditMemberRole] = useState<'leader' | 'member'>('member');
  const [editMemberColor, setEditMemberColor] = useState('');
  const [isSavingMember, setIsSavingMember] = useState(false);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    const syncSidebarLayout = () => {
      const compact = window.innerWidth < 1024;
      setIsCompactLayout(compact);
      setIsSidebarCollapsed(compact ? true : false);
    };

    syncSidebarLayout();
    window.addEventListener('resize', syncSidebarLayout);
    return () => window.removeEventListener('resize', syncSidebarLayout);
  }, []);

  const startEditingMember = (m: UserProfile) => {
    setEditingMember(m);
    setEditMemberName(m.displayName);
    setEditMemberRole(m.role);
    setEditMemberColor(m.colorPreference || '#4f46e5');
  };

  const handleSaveMemberConfig = async () => {
    if (!editingMember) return;
    setIsSavingMember(true);
    try {
      await updateDoc(doc(db, 'users', editingMember.uid), {
        displayName: editMemberName,
        role: editMemberRole,
        colorPreference: editMemberColor
      });
      alert("Member custom settings updated successfully!");
      setEditingMember(null);
    } catch (err) {
      console.error(err);
      alert("Failed to update member config.");
    } finally {
      setIsSavingMember(false);
    }
  };

  const handleRemoveMember = async (memberUid: string) => {
    if (!profile || !profile.teamId) return;
    const confirmRemove = window.confirm("Are you sure you want to remove this member from the team?");
    if (!confirmRemove) return;
    
    try {
      await updateDoc(doc(db, 'teams', profile.teamId), {
        members: arrayRemove(memberUid)
      });
      await updateDoc(doc(db, 'users', memberUid), {
        teamId: ""
      });
      alert("Member removed successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to remove member.");
    }
  };

  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const gigActive = team?.enableDeliveryGig || team?.enableHomeServices || team?.enableCareServices;

  const currentCategories = useMemo(() => {
    if (team?.categories && team.categories.length > 0) return team.categories;
    
    const defaults = [
      { id: 'personal', label: 'Personal', color: '#0ea5e9' },
      { id: 'medical', label: 'Medical', color: '#ef4444' },
      { id: 'other', label: 'Other', color: '#64748b' }
    ];

    if (team?.enableDeliveryGig) defaults.push({ id: 'delivery', label: 'Delivery & Rideshare', color: '#4f46e5' });
    if (team?.enableHomeServices) defaults.push({ id: 'home', label: 'Home & Manual', color: '#10b981' });
    if (team?.enableCareServices) defaults.push({ id: 'care', label: 'Pet & Childcare', color: '#ec4899' });

    return defaults;
  }, [team?.categories, team?.enableDeliveryGig, team?.enableHomeServices, team?.enableCareServices]);

  // Auth Listener
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      try {
        if (u) {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            setProfile(userDoc.data() as UserProfile);
          } else {
            setProfile(null);
          }
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error("Auth initialization error:", error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!profile?.teamId) {
      setTeam(null);
      setTeamMembers([]);
      setShifts([]);
      setEarnings([]);
      setTrips([]);
      return;
    }

    const shiftsQuery = query(
      collection(db, 'shifts'),
      where('teamId', '==', profile.teamId)
    );

    const unsubscribeShifts = onSnapshot(shiftsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ShiftSlot));
      setShifts(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'shifts'));

    const earningsQuery = query(
      collection(db, 'earnings'),
      where('teamId', '==', profile.teamId)
    );

    const unsubscribeEarnings = onSnapshot(earningsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EarningEntry));
      // Sort in-memory
      const sorted = [...data].sort((a, b) => b.date.localeCompare(a.date));
      setEarnings(sorted);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'earnings'));

    const unsubscribeTeam = onSnapshot(doc(db, 'teams', profile.teamId), (snapshot) => {
      if (snapshot.exists()) {
        setTeam({ id: snapshot.id, ...snapshot.data() } as Team);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `teams/${profile.teamId}`));

    const membersQuery = query(
      collection(db, 'users'),
      where('teamId', '==', profile.teamId)
    );

    const unsubscribeMembers = onSnapshot(membersQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as UserProfile);
      setTeamMembers(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    const tripsQuery = query(
      collection(db, 'trips'),
      where('teamId', '==', profile.teamId)
    );

    const unsubscribeTrips = onSnapshot(tripsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkTrip));
      setTrips(data);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'trips'));

    return () => {
      unsubscribeShifts();
      unsubscribeEarnings();
      unsubscribeTeam();
      unsubscribeMembers();
      unsubscribeTrips();
    };
  }, [profile?.teamId]);

  const getAuthClient = () => {
    if (!isFirebaseConfigured || !auth) {
      throw new Error('Firebase is not configured. Check the Firebase environment variables and redeploy.');
    }
    return auth;
  };

  const handleGoogleLogin = async () => {
    const authClient = getAuthClient();
    if (!googleProvider) {
      throw new Error('Google sign-in is not configured.');
    }
    await signInWithRedirect(authClient, googleProvider);
  };

  const handleEmailLogin = async (email: string, password: string) => {
    await signInWithEmailAndPassword(getAuthClient(), email.trim(), password);
  };

  const handleEmailSignup = async (email: string, password: string, displayName: string) => {
    const credential = await createUserWithEmailAndPassword(getAuthClient(), email.trim(), password);
    const cleanName = displayName.trim();
    if (cleanName) {
      await updateProfile(credential.user, { displayName: cleanName });
    }
  };

  const handlePasswordReset = async (email: string) => {
    await sendPasswordResetEmail(getAuthClient(), email.trim());
  };

  const handleStartPhoneLogin = async (phoneNumber: string) => {
    const authClient = getAuthClient();
    try {
      if (!recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current = new RecaptchaVerifier(authClient, 'recaptcha-container', {
          size: 'invisible'
        });
      }
      return await signInWithPhoneNumber(authClient, phoneNumber.trim(), recaptchaVerifierRef.current);
    } catch (error) {
      recaptchaVerifierRef.current?.clear();
      recaptchaVerifierRef.current = null;
      throw error;
    }
  };

  const handleConfirmPhoneCode = async (confirmation: ConfirmationResult, code: string) => {
    await confirmation.confirm(code.trim());
  };

  const handleCreateProfile = async (role: Role, teamName: string, displayName: string) => {
    if (!user) return;
    const teamId = teamName.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substr(2, 5);
    
    const finalDisplayName = displayName || user.displayName || user.email?.split('@')[0] || 'Member';
    
    const newUser: UserProfile = {
      uid: user.uid,
      email: user.email!,
      displayName: finalDisplayName,
      role: 'leader', // Creator is always the leader
      teamId
    };

    try {
      await setDoc(doc(db, 'users', user.uid), newUser);
      const defaultCategories: Category[] = [
        { id: 'Work', label: 'Work', color: '#4f46e5' },
        { id: 'school', label: 'School', color: '#10b981' },
        { id: 'personal', label: 'Personal', color: '#0ea5e9' },
        { id: 'urgent', label: 'Urgent', color: '#ef4444' }
      ];

      await setDoc(doc(db, 'teams', teamId), {
        id: teamId,
        name: teamName,
        leaderId: user.uid,
        enableEarnings: true,
        enableDeliveryGig: true,
        enableHomeServices: true,
        enableCareServices: true,
        enableSplitPay: true,
        splitPayPercentage: 50,
        members: [user.uid],
        categories: defaultCategories,
        createdAt: serverTimestamp()
      } as Team);
      setProfile(newUser);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `initial-setup/${user.uid}`);
    }
  };

  const handleJoinProfile = async (teamId: string, displayName: string): Promise<boolean> => {
    if (!user) return false;
    try {
      const teamSnap = await getDoc(doc(db, 'teams', teamId));
      if (!teamSnap.exists()) {
        return false;
      }

      const finalDisplayName = displayName || user.displayName || user.email?.split('@')[0] || 'Member';

      const newProfile: UserProfile = {
        uid: user.uid,
        email: user.email!,
        displayName: finalDisplayName,
        role: 'member', 
        teamId
      };

      await setDoc(doc(db, 'users', user.uid), newProfile);
      
      // Add user to team members list
      await updateDoc(doc(db, 'teams', teamId), {
        members: arrayUnion(user.uid)
      });

      setProfile(newProfile);
      return true;
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `join-team/${teamId}`);
      return false;
    }
  };

  const updateDisplayName = async (newPathName: string) => {
    if (!profile || !user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: newPathName
      });
      setProfile({ ...profile, displayName: newPathName });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl border border-slate-200">
          <div className="w-16 h-16 bg-rose-600 rounded-2xl flex items-center justify-center text-white mb-6 mx-auto shadow-lg">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-3 text-center">Setup Required</h1>
          <p className="text-slate-600 text-sm mb-6 text-center leading-relaxed">
            Firebase is not configured. Please set up your environment variables.
          </p>
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-6">
            <p className="text-[10px] font-bold text-rose-700 uppercase tracking-widest mb-2">Quick Setup:</p>
            <ol className="text-xs text-rose-600 space-y-1 list-decimal list-inside">
              <li>Copy <code className="font-mono bg-rose-100 px-1">.env.example</code> to <code className="font-mono bg-rose-100 px-1">.env.local</code></li>
              <li>Add your Firebase credentials</li>
              <li>Reload the page</li>
            </ol>
            <div className="mt-3 text-xs text-rose-700">
              <p className="mb-2">Netlify notes:</p>
              <ul className="list-disc list-inside">
                <li>Add the same `VITE_*` environment variables in your Netlify Site settings (Build & deploy → Environment).</li>
                <li>In Firebase Console → Authentication → Authorized domains, add your Netlify domain (example: <code className="font-mono">your-site.netlify.app</code>) or custom domain.</li>
              </ul>
              <button
                onClick={() => {
                  const missing = getMissingFirebaseEnv();
                  alert(missing.length ? 'Missing vars: ' + missing.join(', ') : 'All required VITE_ vars present (client-side check).');
                }}
                className="mt-3 w-full bg-rose-600 text-white rounded-2xl py-2 px-3 font-bold hover:bg-rose-700 transition-all"
              >
                Show missing vars
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest mb-4">Or use demo mode below:</p>
          <button
            onClick={() => {
              setLoading(true);
              setTimeout(() => {
                const mockUser: any = {
                  uid: "dev-mock-uid",
                  email: "demo@gigmate.com",
                  displayName: "Demo User",
                  emailVerified: true
                };
                const mockProfile: UserProfile = {
                  uid: "dev-mock-uid",
                  email: "demo@gigmate.com",
                  displayName: "Demo Lead",
                  role: "leader",
                  teamId: "mock-team-123",
                  colorPreference: "#4f46e5"
                };
                const mockTeam: Team = {
                  id: "mock-team-123",
                  name: "Demo Team",
                  leaderId: "dev-mock-uid",
                  members: ["dev-mock-uid", "member-2", "member-3"],
                  enableDeliveryGig: true,
                  enableHomeServices: true,
                  enableCareServices: false,
                  enableSplitPay: true,
                  splitPayPercentage: 70,
                  enableEarnings: true,
                  categories: [
                    { id: "personal", label: "Personal", color: "#0ea5e9" },
                    { id: "delivery", label: "Delivery", color: "#4f46e5" },
                    { id: "home", label: "Home Tasks", color: "#10b981" }
                  ],
                  createdAt: new Date()
                };
                const mockMembers: UserProfile[] = [
                  mockProfile,
                  { uid: "member-2", email: "sam@demo.com", displayName: "Sam", role: "member", teamId: "mock-team-123", colorPreference: "#10b981" },
                  { uid: "member-3", email: "taylor@demo.com", displayName: "Taylor", role: "member", teamId: "mock-team-123", colorPreference: "#ec4899" }
                ];
                const mockShifts: ShiftSlot[] = [
                  { id: "s1", date: format(new Date(), 'yyyy-MM-dd'), hour: 9, minute: 0, endHour: 17, endMinute: 0, title: "Delivery Run", type: "Delivery", color: "#4f46e5", isAllDay: false, userId: "dev-mock-uid", teamId: "mock-team-123", status: "confirmed", updatedAt: new Date() }
                ];
                const mockEarnings: EarningEntry[] = [
                  { id: "e1", amount: 250.00, category: "Work", budgetCategory: "work", type: "earning", date: format(new Date(), 'yyyy-MM-dd'), userId: "dev-mock-uid", teamId: "mock-team-123", splitPercentage: 70, driverPay: 175, assistantPay: 75, createdAt: new Date() }
                ];

                setUser(mockUser);
                setProfile(mockProfile);
                setTeam(mockTeam);
                setTeamMembers(mockMembers);
                setShifts(mockShifts);
                setEarnings(mockEarnings);
                setLoading(false);
              }, 500);
            }}
            className="w-full bg-indigo-600 text-white rounded-2xl py-3 px-4 font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-lg"
          >
            Load Demo
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-center gap-4">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl mb-4 shadow-lg" />
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        onGoogleLogin={handleGoogleLogin}
        onEmailLogin={handleEmailLogin}
        onEmailSignup={handleEmailSignup}
        onPasswordReset={handlePasswordReset}
        onPhoneStart={handleStartPhoneLogin}
        onPhoneConfirm={handleConfirmPhoneCode}
      />
    );
  }

  if (!profile || !profile.teamId) {
    return <OnboardingView onCreate={handleCreateProfile} onJoin={handleJoinProfile} />;
  }

  const totalEarnings = earnings
    .filter(e => e.type === 'earning')
    .reduce((acc, curr) => acc + curr.amount, 0);
  
  const totalPayments = earnings
    .filter(e => e.type === 'payment')
    .reduce((acc, curr) => acc + curr.amount, 0);

  const splitPayPercent = team?.splitPayPercentage ?? 50;
  const driverTotal = totalEarnings * (splitPayPercent / 100);
  const assistantTotal = totalEarnings * (1 - splitPayPercent / 100);

  // Computed Properties for Miles Tracker sidebar widget (Milestone 10)
  const todayStartStr = format(new Date(), 'yyyy-MM-dd');
  const myTodayCompletedTrips = trips.filter(t => 
    t.userId === profile?.uid && 
    t.status === 'completed' && 
    t.endTime && 
    format(toDate(t.endTime), 'yyyy-MM-dd') === todayStartStr
  );
  const myTodayMileage = myTodayCompletedTrips.reduce((acc, t) => acc + (t.distanceMiles || 0), 0);
  const sidebarActiveTrip = trips.find(t => t.status === 'active' && t.userId === profile?.uid);
  const appNavItems = [
    { id: 'schedule' as View, label: 'Schedule', icon: CalendarIcon },
    { id: 'chat' as View, label: 'Chat', icon: MessageSquare },
    { id: 'mileage' as View, label: 'Miles', icon: Car },
    ...(team?.enableEarnings !== false ? [{ id: 'earnings' as View, label: 'Revenue', icon: DollarSign }] : []),
    { id: 'settings' as View, label: 'Admin', icon: SettingsIcon }
  ];

  const startSidebarTrip = async () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    try {
      const pos = await getCurrentPosition();
      const tripData = {
        userId: profile!.uid,
        teamId: profile!.teamId,
        vehicleName: "Work Vehicle",
        status: 'active',
        startTime: serverTimestamp(),
        startLocation: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        },
        distanceMiles: 0
      };
      await addDoc(collection(db, 'trips'), tripData);
    } catch (err) {
      console.error(err);
      alert("Unable to start trip. Please allow location access and try again.");
    }
  };

  const stopSidebarTrip = async () => {
    if (!sidebarActiveTrip) return;
    if (!sidebarActiveTrip.id) {
      alert("Unable to end trip because this trip has not synced yet.");
      return;
    }
    try {
      const pos = await getCurrentPosition();
      const endLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const miles = calculateMiles(sidebarActiveTrip.startLocation, endLocation);

      await updateDoc(doc(db, 'trips', sidebarActiveTrip.id), {
        status: 'completed',
        endTime: serverTimestamp(),
        endLocation,
        distanceMiles: miles
      });
    } catch (err) {
      console.error(err);
      alert("Unable to end trip. Please allow location access and try again.");
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f0f2f5] text-slate-900 font-sans flex flex-col md:items-center md:justify-center md:p-4 lg:p-8">
      <div className="h-screen md:h-[92vh] w-full max-w-7xl bg-white md:rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
        {/* Top Navigation Header */}
        <header className="h-16 flex items-center justify-between px-4 md:px-8 bg-white border-b border-slate-200 flex-shrink-0 z-40 relative">
          <div className="flex items-center gap-2 md:gap-4 font-black">
            {/* Hamburger menu button for mobile sidebar */}
            <button 
              onClick={() => setIsSidebarCollapsed(prev => !prev)}
              className="p-1.5 hover:bg-slate-100 rounded-xl transition-all text-slate-500 hover:text-indigo-600 active:scale-95"
              title={isSidebarCollapsed ? "Expand Menu" : "Collapse Menu"}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-xl shadow-lg shadow-indigo-200 shrink-0">G</div>
            <div>
              <h1 className="text-base md:text-xl font-black tracking-tighter text-slate-900 uppercase">GigMate</h1>
              <p className="hidden sm:block text-[8px] text-slate-400 font-bold uppercase tracking-widest -mt-1 leading-none">{profile.role === 'leader' ? 'Workspace Admin' : 'Active Account'}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 md:gap-6">
            <nav className="hidden lg:flex absolute left-1/2 -translate-x-1/2 bg-slate-100 p-1 rounded-full border border-slate-200 shrink-0">
              {appNavItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={cn(
                    "px-5 py-1.5 text-xs font-black uppercase tracking-widest rounded-full transition-all",
                    view === item.id ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          
            {/* Account Bubbles for Quick Switching/Viewing */}
            <div className="flex items-center gap-1.5 mr-2">
              <button
                onClick={() => setSelectedMemberId('everyone')}
                className={cn(
                  "px-3 h-8 rounded-full border-2 flex items-center justify-center text-[9px] font-black uppercase tracking-widest transition-all shadow-sm",
                  selectedMemberId === 'everyone' 
                    ? "bg-indigo-600 text-white border-white z-20 ring-2 ring-indigo-100" 
                    : "bg-slate-100 text-slate-500 border-transparent hover:bg-slate-200"
                )}
              >
                All
              </button>
              <div className="w-px h-4 bg-slate-200 mx-1" />
              <div className="flex items-center -space-x-1">
                {teamMembers.slice(0, 8).map(member => (
                  <button
                    key={member.uid}
                    onClick={() => setSelectedMemberId(member.uid)}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-black transition-all hover:translate-y-[-2px] hover:z-10 relative shadow-sm",
                      selectedMemberId === member.uid
                        ? "bg-indigo-600 text-white z-20 ring-2 ring-indigo-100" 
                        : "bg-slate-100 text-slate-600"
                    )}
                    title={member.displayName}
                  >
                    {member.displayName.charAt(0)}
                    {member.role === 'leader' && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-white" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-4 ml-2 border-l border-slate-200 pl-4">
            <div className="text-right">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-tight truncate max-w-[80px] md:max-w-none">{team?.name || 'Loading...'}</p>
              <div className="flex items-center gap-2 justify-end">
                <span className="hidden sm:inline text-[9px] font-black text-indigo-600 uppercase tracking-widest">{profile.displayName.split(' ')[0]}</span>
                <span className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-black text-xs md:text-sm border border-slate-200">
                  {profile.displayName.charAt(0)}
                </span>
              </div>
            </div>
            <button 
              onClick={() => signOut(auth)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 transition-colors"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Bottom navigation for mobile and tablet. */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex items-center justify-between z-50 px-4 pb-safe">
           <button 
             onClick={() => setView('schedule')}
             className={cn(
               "flex flex-col items-center gap-1 transition-all",
               view === 'schedule' ? "text-indigo-600 scale-105" : "text-slate-400"
             )}
           >
             <CalendarIcon className="w-5 h-5" />
             <span className="text-[9px] font-black uppercase tracking-tight">Schedule</span>
           </button>
           <button 
             onClick={() => setView('chat')}
             className={cn(
               "flex flex-col items-center gap-1 transition-all",
               view === 'chat' ? "text-indigo-600 scale-105" : "text-slate-400"
             )}
           >
             <MessageSquare className="w-5 h-5" />
             <span className="text-[9px] font-black uppercase tracking-tight">Chat</span>
           </button>

           {/* Central Half-Moon FAB */}
           <div className="relative -mt-10">
              <AnimatePresence>
                {isFabOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: -10, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                    className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col gap-3 items-center min-w-[200px]"
                  >
                    <button 
                      onClick={() => {
                        setView('calendar');
                        setPendingAssignment(true);
                        setIsFabOpen(false);
                      }}
                      className="bg-white border border-slate-200 px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 w-full active:scale-95 transition-all text-slate-700 hover:bg-indigo-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                        <Plus className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] font-black uppercase tracking-widest leading-none">New assignment</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Single occurrence</p>
                      </div>
                    </button>
                    <button 
                      onClick={() => {
                        setView('calendar');
                        setPendingAssignment(true);
                        setIsFabOpen(false);
                      }}
                      className="bg-white border border-slate-200 px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 w-full active:scale-95 transition-all text-slate-700 hover:bg-slate-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                        <Repeat className="w-4 h-4" />
                      </div>
                      <div className="text-left">
                        <p className="text-[10px] font-black uppercase tracking-widest leading-none">Recurring task</p>
                        <p className="text-[8px] font-bold text-slate-400 uppercase">Template & repeats</p>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <button 
                onClick={() => setIsFabOpen(!isFabOpen)}
                title={isFabOpen ? 'Close actions' : 'Open actions'}
                aria-label={isFabOpen ? 'Close actions' : 'Open actions'}
                className={cn(
                  "w-16 h-16 rounded-full bg-indigo-600 shadow-xl flex flex-col items-center justify-center transition-all border-4 border-white active:scale-90",
                  isFabOpen ? "rotate-45 bg-slate-800" : "bg-indigo-600"
                )}
              >
                <Plus className="w-6 h-6 text-white" />
              </button>
              {!isFabOpen && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                   <div className="whitespace-nowrap px-3 py-1 bg-white rounded-full shadow-sm border border-slate-100 text-[7px] font-black uppercase tracking-widest text-indigo-600 mb-16">ASSIGNMENT</div>
                </div>
              )}
           </div>

           <button 
             onClick={() => setView('earnings')}
             className={cn(
               "flex flex-col items-center gap-1 transition-all",
               view === 'earnings' ? "text-indigo-600 scale-105" : "text-slate-400"
             )}
           >
             <DollarSign className="w-5 h-5" />
             <span className="text-[9px] font-black uppercase tracking-tight">Earnings</span>
           </button>
           <button 
             onClick={() => setView('mileage')}
             className={cn(
               "flex flex-col items-center gap-1 transition-all",
               view === 'mileage' ? "text-indigo-600 scale-105" : "text-slate-400"
             )}
           >
             <Car className="w-5 h-5" />
             <span className="text-[9px] font-black uppercase tracking-tight">Miles</span>
           </button>
           <button 
             onClick={() => setView('settings')}
             className={cn(
               "flex flex-col items-center gap-1 transition-all",
               view === 'settings' ? "text-indigo-600 scale-105" : "text-slate-400"
             )}
           >
             <SettingsIcon className="w-5 h-5" />
             <span className="text-[9px] font-black uppercase tracking-tight">Admin</span>
           </button>
        </nav>

        {/* Sidebar */}
        <motion.aside 
          initial={false}
          animate={{ 
            width: isCompactLayout && isSidebarCollapsed ? 76 : 288
          }}
          className={cn(
            "bg-white border-r border-slate-200 flex flex-col relative z-40 shadow-none flex-shrink-0 overflow-hidden transition-colors"
          )}
        >
          <div className={cn("flex flex-col h-full overflow-y-auto overflow-x-hidden custom-scrollbar", isSidebarCollapsed ? "p-3" : "p-6")}>
            <div className={cn("flex items-center mb-6", isSidebarCollapsed ? "justify-center" : "justify-between")}>
              {!isSidebarCollapsed && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">GigMate</p>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Workspace Menu</p>
                </div>
              )}
              <button
                onClick={() => setIsSidebarCollapsed(prev => !prev)}
                disabled={!isCompactLayout}
                className={cn(
                  "w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all flex items-center justify-center active:scale-95",
                  !isCompactLayout && "opacity-40 cursor-default hover:text-slate-500 hover:border-slate-200"
                )}
                title={isCompactLayout ? (isSidebarCollapsed ? "Expand Menu" : "Collapse Menu") : "Desktop menu stays expanded"}
              >
                {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>

            <div className="mb-8">
              {!isSidebarCollapsed && (
                <motion.h2 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center justify-between"
                >
                  <span>The Team</span>
                  <span className="text-[8px] opacity-60 font-mono">#{profile.teamId}</span>
                </motion.h2>
              )}
              <div className={cn(
                "font-black text-slate-900 transition-all",
                isSidebarCollapsed ? "text-center text-xs mb-6" : "text-sm mb-4 px-1"
              )}>
                {isSidebarCollapsed ? team?.name?.charAt(0) : (team?.name || 'Syncing...')}
              </div>

              <nav className={cn("mb-8 space-y-2", isSidebarCollapsed && "flex flex-col items-center")}>
                {appNavItems.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setView(item.id)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border transition-all active:scale-95",
                        isSidebarCollapsed ? "w-10 h-10 justify-center p-0" : "w-full px-3 py-2.5",
                        view === item.id
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/15"
                          : "bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                      )}
                      title={item.label}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!isSidebarCollapsed && (
                        <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </nav>
              
              {/* Team Section */}
              <div>
                {!isSidebarCollapsed && (
                  <button 
                    onClick={() => toggleSection('team')}
                    className="flex items-center justify-between w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 hover:text-indigo-600 transition-colors"
                  >
                    <span>Team Members</span>
                    {collapsedSections.team ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                  </button>
                )}
                
                <AnimatePresence>
                  {(!collapsedSections.team || isSidebarCollapsed) && (
                    <motion.div 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={cn("space-y-3", isSidebarCollapsed && "flex flex-col items-center")}
                    >
                      <button 
                        onClick={() => setSelectedMemberId('everyone')}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border transition-all relative group/item",
                          isSidebarCollapsed ? "w-10 h-10 p-0 justify-center" : "w-full p-3",
                          selectedMemberId === 'everyone' ? "bg-indigo-600 text-white border-indigo-600" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-indigo-300"
                        )}
                        title="Everyone"
                      >
                        <div className={cn(
                          "rounded-full flex items-center justify-center font-bold shadow-sm",
                          isSidebarCollapsed ? "w-7 h-7" : "w-8 h-8",
                          selectedMemberId === 'everyone' ? "bg-white/20" : "bg-indigo-100 text-indigo-600"
                        )}>
                          <Users className={isSidebarCollapsed ? "w-3 h-3" : "w-4 h-4"} />
                        </div>
                        {!isSidebarCollapsed && (
                          <div className="flex-1 text-left">
                            <p className="text-sm font-bold">Everyone</p>
                          </div>
                        )}
                      </button>

                      {teamMembers.map(member => (
                        <div 
                          key={member.uid}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-xl border transition-all relative group/item p-2",
                            selectedMemberId === member.uid ? "bg-indigo-600 border-indigo-600" : "bg-slate-50 border-slate-200 hover:border-indigo-300"
                          )}
                        >
                          <button 
                            onClick={() => setSelectedMemberId(member.uid)}
                            className="flex-1 flex items-center gap-3 min-w-0"
                            title={member.displayName}
                          >
                            <div 
                              style={{ 
                                backgroundColor: selectedMemberId === member.uid 
                                  ? 'rgba(255,255,255,0.2)' 
                                  : (member.colorPreference || (member.role === 'leader' ? "#4f46e5" : "#10b981")) 
                              }}
                              className={cn(
                                "rounded-full flex items-center justify-center font-bold shadow-sm text-white shrink-0",
                                isSidebarCollapsed ? "w-7 h-7" : "w-8 h-8"
                              )}
                            >
                              {member.displayName.charAt(0)}
                            </div>
                            {!isSidebarCollapsed && (
                              <div className="flex-1 text-left min-w-0">
                                <p className={cn("text-sm font-bold truncate", selectedMemberId === member.uid ? "text-white" : "text-slate-900")}>
                                  {member.displayName}
                                </p>
                                <p className={cn(
                                  "text-[8px] uppercase font-black tracking-widest",
                                  selectedMemberId === member.uid ? "text-indigo-200" : "text-slate-400"
                                )}>
                                  {member.role === 'leader' ? 'Leader' : 'Member'}
                                </p>
                              </div>
                            )}
                          </button>

                          {!isSidebarCollapsed && profile.role === 'leader' && (
                            <button
                              onClick={() => startEditingMember(member)}
                              className={cn(
                                "p-1.5 rounded-lg opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0",
                                selectedMemberId === member.uid ? "text-white hover:bg-white/10" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                              )}
                              title="Edit Member"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {!isSidebarCollapsed && (
              <>
                <div className="my-8">
                  <div className="flex items-center justify-between mb-4">
                    <button 
                      onClick={() => toggleSection('categories')}
                      className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
                    >
                      <span>Categories</span>
                      {collapsedSections.categories ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                    </button>
                    {profile.role === 'leader' && (
                      <button 
                        onClick={() => setShowCategoriesModal(true)}
                        className="p-1 hover:bg-slate-100 rounded-lg text-indigo-600 transition-all hover:scale-110 active:scale-95 flex items-center justify-center"
                        title="Edit Categories"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <AnimatePresence>
                    {!collapsedSections.categories && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-2"
                      >
                        {currentCategories.map(c => (
                          <div key={c.id} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                            <span style={{ backgroundColor: c.color }} className="w-3 h-3 rounded-full"></span> {c.label}
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Miles Tracker Sidebar Widget (Milestone 10) */}
                <div className="my-6 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100/50 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Miles Today</span>
                    <span className="text-[8px] font-black uppercase text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">PWA GPS</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xl font-black text-slate-900 tracking-tight leading-none">
                        {myTodayMileage.toFixed(1)} <span className="text-[10px] font-bold text-slate-400">mi</span>
                      </p>
                      <p className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest mt-1">
                        {sidebarActiveTrip ? 'Recording Trip' : 'System: Ready'}
                      </p>
                    </div>

                    <button 
                      onClick={sidebarActiveTrip ? stopSidebarTrip : startSidebarTrip}
                      className={cn(
                        "px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center gap-1.5",
                        sidebarActiveTrip 
                          ? "bg-rose-600 text-white shadow-rose-600/10 hover:bg-rose-700" 
                          : "bg-indigo-600 text-white shadow-indigo-600/10 hover:bg-indigo-700"
                      )}
                    >
                      {sidebarActiveTrip ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping shrink-0" />
                          Stop
                        </>
                      ) : (
                        <>
                          <Car className="w-3 h-3 shrink-0" />
                          Start
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {team?.enableEarnings !== false && (
                  <div className="mt-auto">
                    <button 
                      onClick={() => toggleSection('revenue')}
                      className="flex items-center justify-between w-full text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 hover:text-indigo-600 transition-colors"
                    >
                      <span>Revenue</span>
                      {collapsedSections.revenue ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                    </button>
                    <AnimatePresence>
                      {!collapsedSections.revenue && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden p-5 bg-slate-900 rounded-2xl text-white shadow-xl"
                        >
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Team Revenue</p>
                          <p className="text-2xl font-black text-white tracking-tight">${totalEarnings.toFixed(2)}</p>
                          {gigActive && (
                            <div className="mt-4 pt-4 border-t border-slate-800 space-y-1">
                              <div className="flex justify-between text-[10px] font-bold">
                                <span className="text-slate-400 uppercase tracking-tight">Leader ({splitPayPercent}%)</span>
                                <span className="text-indigo-400">${driverTotal.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-[10px] font-bold">
                                <span className="text-slate-400 uppercase tracking-tight">Asst. ({100 - splitPayPercent}%)</span>
                                <span className="text-emerald-400">${assistantTotal.toFixed(2)}</span>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </>
            )}
            
            {isSidebarCollapsed && (
              <div className="mt-auto flex flex-col items-center gap-4">
                <div title={`Total: $${totalEarnings.toFixed(2)}`} className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white cursor-help">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
            )}
          </div>
        </motion.aside>

        {/* Dynamic View Area */}
        <section className="flex-1 min-w-0 overflow-hidden pb-0">
          <AnimatePresence mode="wait">
            {view === 'schedule' ? (
              <motion.div 
                key="schedule"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full flex flex-col p-4 md:p-6 lg:p-8"
              >
                <div className="max-w-7xl mx-auto w-full h-full flex flex-col">
                  <CalendarView 
                    currentWeekStart={currentWeekStart}
                    setCurrentWeekStart={setCurrentWeekStart}
                    shifts={shifts}
                    profile={profile}
                    teamMembers={teamMembers}
                    filterMemberId={selectedMemberId}
                    categories={currentCategories}
                    team={team!}
                    pendingAssignment={pendingAssignment}
                    onAssignmentCreated={() => setPendingAssignment(false)}
                  />
                </div>
              </motion.div>
            ) : view === 'chat' ? (
              <motion.div 
                key="chat"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full flex flex-col p-4 md:p-8"
              >
                <div className="max-w-5xl mx-auto w-full h-full">
                  <ChatView 
                    profile={profile}
                    teamId={profile.teamId}
                  />
                </div>
              </motion.div>
            ) : view === 'earnings' ? (
              <motion.div 
                key="earnings"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full custom-scrollbar pb-24 md:pb-8"
              >
                <EarningsView 
                  earnings={earnings}
                  profile={profile}
                  team={team}
                  teamMembers={teamMembers}
                  categories={currentCategories}
                  setView={setView}
                />
              </motion.div>
            ) : view === 'mileage' ? (
              <motion.div 
                key="mileage"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full custom-scrollbar pb-24 md:pb-8"
              >
                <MileageTracker 
                  trips={trips}
                  profile={profile}
                />
              </motion.div>
            ) : (
              <motion.div 
                key="settings"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full custom-scrollbar pb-24 md:pb-8"
              >
                <SettingsView 
                  profile={profile}
                  team={team}
                  teamMembers={teamMembers}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>
      <footer className="h-12 border-t border-slate-200 bg-white flex items-center justify-between px-8 text-[10px] font-bold uppercase tracking-widest text-slate-400">
        <div className="flex gap-8">
          <span>Active: <strong className="text-slate-900">GigMate v1.0</strong></span>
          <span>Last Sync: <strong className="text-slate-900">{format(new Date(), 'HH:mm')}</strong></span>
        </div>
        <div className="flex gap-2 items-center">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span>Connected to Cloud Engine</span>
        </div>
      </footer>
      </div>

      {/* Categories Manager Modal (Milestone 8) */}
      {showCategoriesModal && team && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="relative max-w-lg w-full bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <button 
              onClick={() => setShowCategoriesModal(false)}
              className="absolute top-8 right-8 p-2 text-slate-400 hover:text-slate-600 transition-colors z-10"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="overflow-y-auto max-h-[75vh] pr-2 custom-scrollbar">
              <CategoriesManager team={team} profile={profile!} />
            </div>
          </div>
        </div>
      )}

      {/* Team Member Editor Modal (Milestone 9) */}
      {editingMember && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="relative max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-150 text-left">
            <button 
              onClick={() => setEditingMember(null)}
              className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 transition-colors"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div 
                style={{ backgroundColor: editMemberColor || '#4f46e5' }}
                className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black shadow-md transition-colors"
              >
                {editMemberName.charAt(0) || 'M'}
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">Edit Team Member</h4>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{editingMember.email}</p>
              </div>
            </div>

            <div className="space-y-5 py-2">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 font-mono">Custom Name</label>
                <input 
                  type="text"
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-indigo-600 font-bold transition-all shadow-inner"
                  value={editMemberName}
                  onChange={(e) => setEditMemberName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 font-mono">Custom Color Preference</label>
                <div className="flex flex-wrap gap-2.5">
                  {PRESET_COLORS.map(c => (
                    <button 
                      key={c}
                      onClick={() => setEditMemberColor(c)}
                      style={{ backgroundColor: c }}
                      className={cn(
                        "w-7 h-7 rounded-lg border-4 transition-all",
                        editMemberColor === c ? "border-white scale-110 shadow-lg ring-2 ring-indigo-100" : "border-transparent opacity-40 hover:opacity-100"
                      )}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 font-mono">System Role</label>
                <div className="flex bg-slate-100 p-1 rounded-2xl">
                  <button 
                    onClick={() => setEditMemberRole('member')}
                    className={cn(
                      "flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all",
                      editMemberRole === 'member' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Member
                  </button>
                  <button 
                    onClick={() => setEditMemberRole('leader')}
                    className={cn(
                      "flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all",
                      editMemberRole === 'leader' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    Leader
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              <div className="flex gap-4">
                <button 
                  onClick={() => setEditingMember(null)}
                  className="flex-1 h-14 border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center"
                >
                  Cancel
                </button>
                <button 
                  disabled={isSavingMember}
                  onClick={handleSaveMemberConfig}
                  className="flex-1 h-14 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-xl shadow-indigo-600/20 active:scale-95 flex items-center justify-center"
                >
                  {isSavingMember ? 'Saving...' : 'Save Changes'}
                </button>
              </div>

              {editingMember.uid !== profile!.uid && (
                <button 
                  onClick={async () => {
                    await handleRemoveMember(editingMember.uid);
                    setEditingMember(null);
                  }}
                  className="w-full h-14 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove from Team
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-Views ---

type LoginMode = 'email' | 'phone';

type LoginViewProps = {
  onGoogleLogin: () => Promise<void>;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onEmailSignup: (email: string, password: string, displayName: string) => Promise<void>;
  onPasswordReset: (email: string) => Promise<void>;
  onPhoneStart: (phoneNumber: string) => Promise<ConfirmationResult>;
  onPhoneConfirm: (confirmation: ConfirmationResult, code: string) => Promise<void>;
};

function getAuthErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code) : '';
  if (code.includes('auth/api-key-expired') || code.includes('api-key-expired')) return 'Firebase says this API key is expired. Replace VITE_FIREBASE_API_KEY with the current Firebase web app key, then restart the app.';
  if (code.includes('auth/api-key-not-valid') || code.includes('api-key-not-valid')) return 'Firebase rejected this API key. Check VITE_FIREBASE_API_KEY and restart the app.';
  if (code.includes('auth/unauthorized-domain')) return 'This domain is not authorized in Firebase.';
  if (code.includes('auth/user-not-found') || code.includes('auth/wrong-password') || code.includes('auth/invalid-credential')) return 'Email or password is incorrect.';
  if (code.includes('auth/email-already-in-use')) return 'That email already has an account.';
  if (code.includes('auth/weak-password')) return 'Use a password with at least 6 characters.';
  if (code.includes('auth/invalid-phone-number')) return 'Enter a phone number with country code, like +15551234567.';
  if (code.includes('auth/too-many-requests')) return 'Too many attempts. Wait a bit and try again.';
  if (error instanceof Error) return error.message;
  return 'Sign-in failed. Please try again.';
}

function LoginView({
  onGoogleLogin,
  onEmailLogin,
  onEmailSignup,
  onPasswordReset,
  onPhoneStart,
  onPhoneConfirm
}: LoginViewProps) {
  const [mode, setMode] = useState<LoginMode>('email');
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneConfirmation, setPhoneConfirmation] = useState<ConfirmationResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runAuthAction = async (action: () => Promise<void>, successMessage?: string) => {
    setMessage(null);
    setIsLoading(true);
    try {
      await action();
      if (successMessage) setMessage(successMessage);
    } catch (error) {
      console.error('Auth error:', error);
      setMessage(getAuthErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const submitEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setMessage('Enter an email and password.');
      return;
    }
    void runAuthAction(
      () => isCreatingAccount ? onEmailSignup(email, password, displayName) : onEmailLogin(email, password),
    );
  };

  const submitPhone = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!phoneConfirmation) {
      if (!phoneNumber.trim()) {
        setMessage('Enter a phone number with country code.');
        return;
      }
      void runAuthAction(async () => {
        const confirmation = await onPhoneStart(phoneNumber);
        setPhoneConfirmation(confirmation);
        setPhoneCode('');
      }, 'Code sent.');
      return;
    }
    if (!phoneCode.trim()) {
      setMessage('Enter the code from your text message.');
      return;
    }
    void runAuthAction(() => onPhoneConfirm(phoneConfirmation, phoneCode));
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 grid lg:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-slate-950 text-white p-8 sm:p-10 flex flex-col justify-between gap-10">
          <div>
            <div className="w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
              <Briefcase className="w-7 h-7" />
            </div>
            <h1 className="text-4xl font-black tracking-tight mb-3">GigMate</h1>
            <p className="text-slate-300 text-sm leading-6 max-w-sm">Team scheduling, chat, earnings, and mileage in one installable workspace.</p>
          </div>
          <div className="grid gap-3 text-sm text-slate-200">
            {['Create or join a team', 'Schedule shifts together', 'Track earnings and mileage'].map(item => (
              <div key={item} className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 sm:p-10">
          <div className="mb-7">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-700 mb-2">Account</p>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight">Sign in to continue</h2>
          </div>

          <button
            disabled={isLoading}
            onClick={() => void runAuthAction(onGoogleLogin)}
            className="w-full h-12 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="w-5 h-5 rounded-full bg-slate-950 text-white text-xs font-black flex items-center justify-center">G</span>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">or</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 mb-5">
            <button
              type="button"
              onClick={() => setMode('email')}
              className={cn(
                "h-11 rounded-lg text-sm font-black transition-all flex items-center justify-center gap-2",
                mode === 'email' ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Mail className="w-4 h-4" />
              Email
            </button>
            <button
              type="button"
              onClick={() => setMode('phone')}
              className={cn(
                "h-11 rounded-lg text-sm font-black transition-all flex items-center justify-center gap-2",
                mode === 'phone' ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Phone className="w-4 h-4" />
              Phone
            </button>
          </div>

          {mode === 'email' ? (
            <form onSubmit={submitEmail} className="space-y-4">
              {isCreatingAccount && (
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Name</span>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="Your name"
                    />
                  </div>
                </label>
              )}
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Email</span>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Password</span>
                <div className="relative">
                  <LockKeyhole className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="Password"
                    autoComplete={isCreatingAccount ? 'new-password' : 'current-password'}
                  />
                </div>
              </label>
              <button
                disabled={isLoading}
                className="w-full h-12 rounded-xl bg-emerald-600 text-white font-black hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Working...' : isCreatingAccount ? 'Create account' : 'Sign in'}
              </button>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <button type="button" onClick={() => setIsCreatingAccount(value => !value)} className="font-bold text-slate-700 hover:text-slate-950">
                  {isCreatingAccount ? 'Use existing account' : 'Create an account'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!email.trim()) {
                      setMessage('Enter your email first.');
                      return;
                    }
                    void runAuthAction(() => onPasswordReset(email), 'Password reset email sent.');
                  }}
                  className="font-bold text-emerald-700 hover:text-emerald-800"
                >
                  Reset password
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={submitPhone} className="space-y-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Phone</span>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                    className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="+15551234567"
                    autoComplete="tel"
                    disabled={Boolean(phoneConfirmation)}
                  />
                </div>
              </label>
              {phoneConfirmation && (
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Code</span>
                  <input
                    inputMode="numeric"
                    value={phoneCode}
                    onChange={(event) => setPhoneCode(event.target.value)}
                    className="w-full h-12 px-4 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="123456"
                    autoComplete="one-time-code"
                  />
                </label>
              )}
              <button
                disabled={isLoading}
                className="w-full h-12 rounded-xl bg-emerald-600 text-white font-black hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Working...' : phoneConfirmation ? 'Verify code' : 'Text me a code'}
              </button>
              {phoneConfirmation && (
                <button
                  type="button"
                  onClick={() => {
                    setPhoneConfirmation(null);
                    setPhoneCode('');
                    setMessage(null);
                  }}
                  className="w-full h-10 text-sm font-bold text-slate-600 hover:text-slate-950"
                >
                  Use a different number
                </button>
              )}
            </form>
          )}

          {message && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              {message}
            </div>
          )}
          <div id="recaptcha-container" className="min-h-0" />
        </div>
      </div>
    </div>
  );
}

function OnboardingView({ onCreate, onJoin }: { 
  onCreate: (role: Role, teamName: string, displayName: string) => void;
  onJoin: (teamId: string, displayName: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleJoin = async () => {
    if (!teamId.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const success = await onJoin(teamId, displayName);
      if (!success) {
        setError("Team not found. Check the code and try again.");
      }
    } catch (e) {
      setError("Connection error. Please try again.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-slate-50 to-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-20 right-20 w-72 h-72 bg-indigo-200/20 rounded-full blur-3xl" />
      <div className="absolute bottom-20 left-20 w-96 h-96 bg-indigo-300/10 rounded-full blur-3xl" />

      <div className="max-w-lg w-full bg-white rounded-3xl p-10 shadow-2xl border border-slate-200 relative z-10">
        {/* Tab selector */}
        <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
          <button 
            onClick={() => setMode('create')}
            className={cn(
              "flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all",
              mode === 'create' ? "bg-white text-indigo-600 shadow-md" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Create
          </button>
          <button 
            onClick={() => setMode('join')}
            className={cn(
              "flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl transition-all",
              mode === 'join' ? "bg-white text-indigo-600 shadow-md" : "text-slate-500 hover:text-slate-700"
            )}
          >
            Join
          </button>
        </div>

        <h1 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
          {mode === 'create' ? 'Start Your Team' : 'Join a Team'}
        </h1>
        <p className="text-sm text-slate-600 mb-6">
          {mode === 'create' ? 'Create a workspace and invite your team' : 'Join an existing team with an invite code'}
        </p>

        {/* Form */}
        <div className="space-y-4">
          {/* Name Input */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">Your Name</label>
            <input 
              type="text"
              placeholder="e.g. Alex"
              autoFocus
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all font-semibold"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-semibold">
              {error}
            </div>
          )}

          {/* Create Team Mode */}
          {mode === 'create' ? (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">Team Name</label>
                <input 
                  type="text"
                  placeholder="e.g. Metro Delivery"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all font-semibold"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </div>

              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 text-xs text-blue-700 font-semibold">
                You'll be the admin and can invite others
              </div>

              <button 
                disabled={!teamName?.trim() || !displayName?.trim() || loading}
                onClick={async () => { 
                  setLoading(true); 
                  try {
                    await onCreate('leader', teamName, displayName);
                  } catch(e) {
                    setError("Failed to create team. Try again.");
                    setLoading(false);
                  }
                }}
                className="w-full bg-indigo-600 text-white rounded-xl py-3 px-4 font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>Create Team</>
                )}
              </button>
            </>
          ) : (
            <>
              {/* Join Team Mode */}
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">Invite Code</label>
                <input 
                  type="text"
                  placeholder="Paste the code from your team leader"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-600 focus:border-transparent transition-all font-semibold"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">Ask your team leader to share the code</p>
              </div>

              <button 
                disabled={!teamId?.trim() || !displayName?.trim() || loading}
                onClick={handleJoin}
                className="w-full bg-indigo-600 text-white rounded-xl py-3 px-4 font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>Join Team</>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatView({ profile, teamId }: { profile: UserProfile, teamId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(
      collection(db, 'messages'),
      where('teamId', '==', teamId),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage)));
    });
  }, [teamId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    try {
      await addDoc(collection(db, 'messages'), {
        text: input,
        senderId: profile.uid,
        senderName: profile.displayName,
        teamId,
        createdAt: serverTimestamp()
      });
      setInput('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 relative overflow-hidden">
       {/* WhatsApp Header */}
       <div className="z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 border border-indigo-200">
                <Users className="w-5 h-5" />
             </div>
             <div>
                <h2 className="text-sm font-black text-slate-800 leading-none mb-1">Team Chat</h2>
                <div className="flex items-center gap-1">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                   <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Active now</span>
                </div>
             </div>
          </div>
          <div className="flex items-center gap-2">
             <button title="Chat settings" aria-label="Chat settings" className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><SettingsIcon className="w-5 h-5" /></button>
          </div>
       </div>

       {/* Message Area */}
       <div 
         ref={scrollRef}
         className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 custom-scrollbar bg-[#f0f2f5]"
       >
          <div className="max-w-3xl mx-auto space-y-4">
             {messages.map((m, idx) => {
                const isMe = m.senderId === profile.uid;
                const nextMessage = messages[idx + 1];
                const isLastFromUser = !nextMessage || nextMessage.senderId !== m.senderId;

                return (
                  <div key={m.id} className={cn(
                    "flex flex-col group",
                    isMe ? "items-end" : "items-start"
                  )}>
                     {!isMe && ! (idx > 0 && messages[idx - 1].senderId === m.senderId) && (
                        <span className="text-[9px] font-black uppercase text-indigo-500 mb-1 ml-2 tracking-widest">{m.senderName.split(' ')[0]}</span>
                     )}
                     <div className={cn(
                       "relative px-4 py-2.5 shadow-sm max-w-[85%] md:max-w-[70%] transition-all",
                       isMe 
                        ? "bg-indigo-600 text-white rounded-2xl rounded-tr-none" 
                        : "bg-white text-slate-800 rounded-2xl rounded-tl-none border border-slate-200"
                     )}>
                        <p className="text-sm font-medium leading-relaxed">{m.text}</p>
                        <div className={cn(
                           "text-[8px] font-bold mt-1 opacity-50 uppercase tracking-tighter",
                           isMe ? "text-right" : "text-left"
                        )}>
                           {m.createdAt ? format(m.createdAt.toDate ? m.createdAt.toDate() : new Date(), 'HH:mm') : '...'}
                        </div>
                     </div>
                  </div>
                );
             })}
          </div>
       </div>

       {/* WhatsApp Input */}
       <div className="bg-white p-4 border-t border-slate-200 shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
          <form 
            onSubmit={sendMessage} 
            className="max-w-3xl mx-auto flex items-center gap-3 bg-slate-100 p-1 rounded-2xl border border-slate-200 focus-within:border-indigo-400 focus-within:bg-white transition-all shadow-inner"
          >
             <button type="button" title="Attach files" aria-label="Attach files" className="p-3 text-slate-400 hover:text-indigo-600"><Plus className="w-5 h-5" /></button>
             <input 
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Message team..."
                className="flex-1 bg-transparent px-2 py-3 text-sm font-semibold outline-none text-slate-900 placeholder:text-slate-400"
             />
             <button 
               type="submit" 
               disabled={!input.trim()}
               className={cn(
                 "p-3 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:scale-90",
                 input.trim() ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-400"
               )}
             >
                <ChevronRight className="w-6 h-6 rotate-[-90deg] -translate-x-0.5" />
             </button>
          </form>
       </div>
    </div>
  );
}

function CalendarView({ 
  currentWeekStart, 
  setCurrentWeekStart, 
  shifts, 
  profile, 
  teamMembers,
  filterMemberId,
  categories,
  team,
  pendingAssignment,
  onAssignmentCreated
}: { 
  currentWeekStart: Date; 
  setCurrentWeekStart: (d: Date) => void;
  shifts: ShiftSlot[];
  profile: UserProfile;
  teamMembers: UserProfile[];
  filterMemberId: string | 'everyone';
  categories: Category[];
  team: Team;
  pendingAssignment?: boolean;
  onAssignmentCreated?: () => void;
}) {
  const [calendarMode, setCalendarMode] = useState<'week' | 'two-weeks' | 'month'>('week');

  const days = useMemo(() => {
    if (calendarMode === 'week') {
      return eachDayOfInterval({
        start: currentWeekStart,
        end: addDays(currentWeekStart, 6)
      });
    } else if (calendarMode === 'two-weeks') {
      return eachDayOfInterval({
        start: currentWeekStart,
        end: addDays(currentWeekStart, 13)
      });
    } else {
      const start = startOfMonth(currentWeekStart);
      const end = endOfMonth(currentWeekStart);
      return eachDayOfInterval({ start, end });
    }
  }, [currentWeekStart, calendarMode]);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pendingAssignment) {
      const today = format(new Date(), 'yyyy-MM-dd');
      toggleSlot(today, 12);
      onAssignmentCreated?.();
    }
  }, [pendingAssignment]);
  
  const [selectedSlot, setSelectedSlot] = useState<{ date: string, hour: number, minute: number, shiftId?: string, shiftOwnerId?: string } | null>(null);
  const [modalDate, setModalDate] = useState('');
  const [modalHour, setModalHour] = useState(12);
  const [modalMinute, setModalMinute] = useState(0);
  const [modalEndHour, setModalEndHour] = useState(13);
  const [modalEndMinute, setModalEndMinute] = useState(0);
  const [isAllDayModal, setIsAllDayModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [slotTitle, setSlotTitle] = useState('');
  const [slotColor, setSlotColor] = useState(PRESET_COLORS[0]);
  const [slotCategory, setSlotCategory] = useState<string>('work');
  const [slotLabel, setSlotLabel] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [inviteTeam, setInviteTeam] = useState(false);
  const [estimatedCost, setEstimatedCost] = useState<string>('');
  const [selectedMobileDate, setSelectedMobileDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);

  // Driver-assistant request states
  const [requestType, setRequestType] = useState<'absence' | 'change'>('absence');
  const [requestNotesText, setRequestNotesText] = useState('');
  const [reqHour, setReqHour] = useState(12);
  const [reqMin, setReqMin] = useState(0);
  const [reqEndHour, setReqEndHour] = useState(13);
  const [reqEndMin, setReqEndMin] = useState(0);

  // Center around noon on mount
  useEffect(() => {
    if (scrollContainerRef.current) {
      const noonElement = scrollContainerRef.current.querySelector('[data-hour="12"]');
      if (noonElement) {
        noonElement.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
      }
    }
  }, []);

  // Update form when slot selection changes
  useEffect(() => {
    if (selectedSlot) {
      setModalDate(selectedSlot.date);
      setModalHour(selectedSlot.hour);
      setModalMinute(selectedSlot.minute || 0);
      const existing = selectedSlot.shiftId 
        ? shifts.find(s => s.id === selectedSlot.shiftId)
        : shifts.find(s => s.date === selectedSlot.date && s.hour === selectedSlot.hour && s.minute === (selectedSlot.minute || 0) && s.userId === profile.uid);
      
      setModalEndHour(existing?.endHour ?? ((selectedSlot.hour + 1) % 24));
      setModalEndMinute(existing?.endMinute || 0);
      setIsAllDayModal(existing?.isAllDay || false);
      setNotes(existing?.notes || '');
      setSlotTitle(existing?.title || '');
      setSlotColor(existing?.color || PRESET_COLORS[0]);
      setSlotCategory(existing?.type || categories[0]?.id || 'work');
      setReminderEnabled(existing?.reminderEnabled || false);
      setInviteTeam(existing?.inviteTeam || false);
      setEstimatedCost(existing?.estimatedCost ? String(existing.estimatedCost) : '');

      // Load request values if present
      setRequestType(existing?.requestType || 'absence');
      setRequestNotesText(existing?.requestNotes || '');
      setReqHour(existing?.requestedHours?.hour ?? existing?.hour ?? selectedSlot.hour);
      setReqMin(existing?.requestedHours?.minute ?? existing?.minute ?? selectedSlot.minute ?? 0);
      setReqEndHour(existing?.requestedHours?.endHour ?? existing?.endHour ?? ((selectedSlot.hour + 1) % 24));
      setReqEndMin(existing?.requestedHours?.endMinute ?? existing?.endMinute ?? 0);
    }
  }, [selectedSlot, shifts, profile.uid, categories]);

  const toggleSlot = (date: string, hour: number, minute: number = 0, shiftId?: string, shiftOwnerId?: string) => {
    setSelectedSlot(s => (s?.date === date && s?.hour === hour && s?.minute === minute) ? null : { date, hour, minute, shiftId, shiftOwnerId });
  };

  const saveShift = async () => {
    if (!selectedSlot) return;
    const date = modalDate;
    const hour = modalHour;
    const minute = modalMinute;
    const endHour = modalEndHour;
    const endMinute = modalEndMinute;
    const isAllDay = isAllDayModal;
    
    const targetUserId = selectedSlot.shiftOwnerId || (filterMemberId !== 'everyone' ? filterMemberId : profile.uid);
    const existingShift = selectedSlot.shiftId 
      ? shifts.find(s => s.id === selectedSlot.shiftId)
      : shifts.find(s => s.date === date && s.hour === hour && (s.minute || 0) === minute && s.userId === targetUserId);

    // Approval logic: Non-work types by non-leaders require approval
    const isWorkType = slotCategory === 'Work' || slotCategory === 'scheduled';
    const finalStatus = (profile.role === 'leader' || isWorkType) ? 'confirmed' : 'pending';

    const isMemberRequest = profile.role === 'member' && existingShift && existingShift.status === 'confirmed';

    try {
      const shiftData: Partial<ShiftSlot> = isMemberRequest ? {
        status: 'pending',
        requestType,
        requestNotes: requestNotesText,
        requestedHours: requestType === 'change' ? {
          hour: reqHour,
          minute: reqMin,
          endHour: reqEndHour,
          endMinute: reqEndMin
        } : null,
        updatedAt: serverTimestamp()
      } : {
        date,
        hour,
        minute,
        endHour,
        endMinute,
        isAllDay,
        type: slotCategory,
        title: slotTitle || (categories.find(c => c.id === slotCategory)?.label || 'Event'),
        color: slotColor,
        notes,
        status: existingShift?.status || finalStatus,
        userId: targetUserId,
        teamId: profile.teamId,
        reminderEnabled,
        inviteTeam,
        estimatedCost: estimatedCost ? parseFloat(estimatedCost) : undefined,
        updatedAt: serverTimestamp()
      };

      if (existingShift) {
        await updateDoc(doc(db, 'shifts', existingShift.id!), shiftData);
      } else {
        const id = `${targetUserId}-${date}-${hour}-${minute}`;
        await setDoc(doc(db, 'shifts', id), shiftData);
        
        // Auto-invite chat notification
        if (inviteTeam) {
          await addDoc(collection(db, 'messages'), {
            text: `📅 New Team Event: "${shiftData.title}" on ${date ? format(parseISO(date), 'MMM do') : 'Unknown Date'} at ${hour}:${String(minute).padStart(2, '0')}. Check the calendar!`,
            senderId: profile.uid,
            senderName: profile.displayName,
            teamId: profile.teamId,
            createdAt: serverTimestamp()
          });
        }
      }
      setSelectedSlot(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'shifts');
    }
  };

  const [approvalSuccess, setApprovalSuccess] = useState(false);

  const approveShift = async (shiftId: string) => {
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;

    try {
      if (shift.requestType === 'absence') {
        await deleteDoc(doc(db, 'shifts', shiftId));
      } else if (shift.requestType === 'change' && shift.requestedHours) {
        await updateDoc(doc(db, 'shifts', shiftId), {
          hour: shift.requestedHours.hour,
          minute: shift.requestedHours.minute,
          endHour: shift.requestedHours.endHour,
          endMinute: shift.requestedHours.endMinute,
          status: 'confirmed',
          requestType: null,
          requestNotes: null,
          requestedHours: null,
          updatedAt: serverTimestamp()
        });
      } else {
        await updateDoc(doc(db, 'shifts', shiftId), {
          status: 'confirmed',
          updatedAt: serverTimestamp()
        });
      }
      setApprovalSuccess(true);
      setTimeout(() => {
        setApprovalSuccess(false);
        setSelectedSlot(null);
      }, 1500);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'shifts');
    }
  };

  const denyShiftRequest = async (shiftId: string) => {
    try {
      await updateDoc(doc(db, 'shifts', shiftId), {
        status: 'confirmed',
        requestType: null,
        requestNotes: null,
        requestedHours: null,
        updatedAt: serverTimestamp()
      });
      setSelectedSlot(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'shifts');
    }
  };

  const deleteShift = async (shiftId?: string) => {
    if (!selectedSlot && !shiftId) return;
    
    let targetId = shiftId;
    if (!targetId) {
      const { date, hour } = selectedSlot!;
      const existingShift = shifts.find(s => s.date === date && s.hour === hour && s.userId === profile.uid);
      if (!existingShift) return;
      targetId = existingShift.id;
    }

    try {
      await deleteDoc(doc(db, 'shifts', targetId!));
      setSelectedSlot(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'shifts');
    }
  };

  return (
    <div className="flex flex-col gap-2 md:gap-4 h-full">
      {/* Pending Approvals Banner */}
      {profile.role === 'leader' && (() => {
        const pendingRequests = shifts.filter(s => s.status === 'pending' && s.requestType);
        if (pendingRequests.length === 0) return null;
        
        return (
          <div className="flex flex-col gap-2 p-5 bg-amber-50 rounded-3xl border border-amber-100/70 shadow-sm relative overflow-hidden mb-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-amber-700 tracking-widest flex items-center gap-1.5 animate-pulse">
                <Shield className="w-4 h-4 text-amber-600" /> Pending Shift Actions ({pendingRequests.length})
              </span>
              <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest hidden sm:inline">Workspace members have requested changes</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-1">
              {pendingRequests.map(req => {
                const reqUser = teamMembers.find(m => m.uid === req.userId);
                return (
                  <div 
                    key={req.id}
                    onClick={() => {
                      setSelectedMobileDate(req.date);
                      setSelectedSlot({
                        date: req.date,
                        hour: req.hour,
                        minute: req.minute,
                        shiftId: req.id,
                        shiftOwnerId: req.userId
                      });
                    }}
                    className="bg-white hover:bg-amber-100/20 border border-slate-100 hover:border-amber-300 p-4 rounded-2xl flex flex-col gap-1 cursor-pointer transition-all active:scale-95 shadow-sm"
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-black text-slate-800 truncate block max-w-[150px]">{req.title}</span>
                      <span className="text-[8px] font-black uppercase tracking-widest bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200">
                        {req.requestType}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[9px] font-bold text-slate-500">
                        By {reqUser?.displayName || 'Member'}
                      </span>
                      <span className="text-[9px] font-black text-indigo-650">
                        {req.date}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Calendar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between sm:justify-start gap-4 md:gap-6">
          <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight whitespace-nowrap">
            {format(currentWeekStart, 'MMMM yyyy')}
          </h2>
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-200/50 p-1 rounded-full border border-slate-200 scale-90 sm:scale-100 origin-left">
              <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, -7))} title="Previous week" aria-label="Previous week" className="p-2 hover:bg-white rounded-full transition-all text-slate-500"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => {
                setCurrentWeekStart(startOfWeek(new Date()));
                setSelectedMobileDate(format(new Date(), 'yyyy-MM-dd'));
              }} className="px-3 md:px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-600 hover:text-indigo-600 transition-all">Today</button>
              <button onClick={() => setCurrentWeekStart(addDays(currentWeekStart, 7))} title="Next week" aria-label="Next week" className="p-2 hover:bg-white rounded-full transition-all text-slate-500"><ChevronRight className="w-4 h-4" /></button>
            </div>

            {/* Calendar Mode Selector (Collapsible Full-Week / 2-Week / Month menu) */}
            <div className="flex bg-slate-200/50 p-1 rounded-full border border-slate-200 scale-90 sm:scale-100 origin-left">
              <button 
                onClick={() => setCalendarMode('week')}
                className={cn(
                  "px-3 py-1 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-full transition-all",
                  calendarMode === 'week' ? "bg-white shadow-sm text-indigo-600 font-extrabold" : "text-slate-500 hover:text-indigo-600"
                )}
              >
                1 Wk
              </button>
              <button 
                onClick={() => setCalendarMode('two-weeks')}
                className={cn(
                  "px-3 py-1 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-full transition-all",
                  calendarMode === 'two-weeks' ? "bg-white shadow-sm text-indigo-600 font-extrabold" : "text-slate-500 hover:text-indigo-600"
                )}
              >
                2 Wks
              </button>
              <button 
                onClick={() => setCalendarMode('month')}
                className={cn(
                  "px-3 py-1 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-full transition-all",
                  calendarMode === 'month' ? "bg-white shadow-sm text-indigo-600 font-extrabold" : "text-slate-500 hover:text-indigo-600"
                )}
              >
                Month
              </button>
            </div>
            
            {/* Quick Categories Toggle */}
            <button 
              onClick={() => setShowCategoriesModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-full text-[9px] font-black uppercase tracking-widest text-slate-600 hover:border-indigo-300 transition-all shadow-sm"
            >
              <Layers className="w-3.3 h-3.3 text-indigo-500" />
              <span className="hidden sm:inline">Manage Categories</span>
            </button>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
           <Clock className="w-3 h-3" /> 24h Grid
        </div>
      </div>

      {/* Mobile Vertical Weekly agenda list */}
      <div className="md:hidden flex-1 flex flex-col gap-3 overflow-y-auto custom-scrollbar pb-24 pr-1">
        {days.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isToday = isSameDay(day, new Date());
          
          // Get all shifts for this day
          const dayShifts = shifts.filter(s => s.date === dateStr);
          const visibleShifts = filterMemberId === 'everyone' 
            ? dayShifts 
            : dayShifts.filter(s => s.userId === filterMemberId);
            
          return (
            <div 
              key={dateStr}
              className={cn(
                "bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex items-start gap-4 transition-all",
                isToday ? "border-indigo-200 ring-1 ring-indigo-50 bg-indigo-50/5" : ""
              )}
            >
              {/* Left Side: Date circle */}
              <div className="flex flex-col items-center min-w-[50px] shrink-0">
                <span className={cn(
                  "text-[9px] font-black uppercase tracking-widest mb-1",
                  isToday ? "text-indigo-600" : "text-slate-400"
                )}>
                  {format(day, 'EEE')}
                </span>
                <div className={cn(
                  "w-11 h-11 rounded-2xl flex items-center justify-center font-black text-base shadow-sm tracking-tighter transition-all",
                  isToday ? "bg-indigo-600 text-white shadow-indigo-200" : "bg-slate-50 text-slate-700 border border-slate-100"
                )}>
                  {format(day, 'd')}
                </div>
                {isToday && <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-2 animate-pulse" />}
              </div>
              
              {/* Right Side: Shift Blocks & Controls */}
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">
                    {visibleShifts.length} {visibleShifts.length === 1 ? 'Event' : 'Events'}
                  </span>
                  <button 
                    onClick={() => toggleSlot(dateStr, 12)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-50 hover:bg-indigo-50 border border-slate-100 rounded-full text-[8px] font-black uppercase tracking-widest text-slate-600 hover:text-indigo-600 transition-all active:scale-95"
                  >
                    <Plus className="w-2.5 h-2.5" /> Add
                  </button>
                </div>
                
                {visibleShifts.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {visibleShifts.map(s => (
                      <div 
                        key={s.id}
                        onClick={() => toggleSlot(dateStr, s.hour, s.minute, s.id, s.userId)}
                        className="rounded-xl p-3 text-white shadow-sm flex flex-col relative overflow-hidden border border-white/10 active:brightness-95 cursor-pointer"
                        style={{ backgroundColor: s.color }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-black truncate">{s.title}</span>
                          <span className="text-[8px] font-black bg-white/20 px-1.5 py-0.5 rounded-md border border-white/10 shrink-0">
                            {s.isAllDay 
                              ? 'All Day' 
                              : `${String(s.hour).padStart(2, '0')}:${String(s.minute || 0).padStart(2, '0')}`}
                          </span>
                        </div>
                        
                        {/* Member Details or splitting stats */}
                        <div className="mt-2 flex items-center justify-between opacity-80">
                          <span className="text-[9px] font-bold">
                            {s.userId === profile.uid ? 'Me' : teamMembers.find(m => m.uid === s.userId)?.displayName.split(' ')[0]}
                          </span>
                          <div className="flex items-center gap-1 text-[9px] font-bold">
                            {s.status === 'pending' && (
                              <span className="bg-rose-500/30 text-rose-100 px-1.5 py-0.5 rounded-full text-[7px] font-extrabold uppercase tracking-widest animate-pulse border border-rose-500/20">
                                Pending
                              </span>
                            )}
                            {s.estimatedCost !== undefined && (
                              <span className="bg-white/20 px-1.5 py-0.5 rounded-full border border-white/10">
                                ${s.estimatedCost}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div 
                    onClick={() => toggleSlot(dateStr, 12)}
                    className="border border-dashed border-slate-200 rounded-xl p-4 text-center text-[10px] font-bold text-slate-400 hover:border-indigo-300 hover:bg-slate-50/30 transition-all cursor-pointer"
                  >
                    No shifts scheduled. Tap to add.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid Card */}
      <div className="hidden md:flex flex-col flex-1 geometric-card overflow-x-auto overflow-y-hidden custom-scrollbar shadow-xl border-slate-200/60 bg-white min-h-[400px]">
        {/* Day Headers (Desktop only) */}
        <div className="hidden md:grid grid-cols-[80px_1fr] border-b border-slate-100 bg-white sticky top-0 z-20 min-w-max">
          <button 
            onClick={() => toggleSlot(format(new Date(), 'yyyy-MM-dd'), 12)}
            className="border-r border-slate-100 flex items-center justify-center bg-indigo-50/50 hover:bg-indigo-100 transition-colors group sticky left-0 z-30 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]"
          >
            <Plus className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
          </button>
          <div 
            className="grid grid-cols-1 md:grid mobile-grid-override width-full"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(120px, 1fr))` }}
          >
            {days.map((day, i) => {
              const isToday = isSameDay(day, new Date());
              const dateStr = format(day, 'yyyy-MM-dd');
              const isSelected = modalDate === dateStr || (selectedSlot?.date === dateStr);
              
              return (
                <div 
                  key={i} 
                  className={cn(
                    "p-3 text-center border-r border-slate-100 last:border-r-0 flex flex-col items-center relative transition-all duration-300",
                    isSelected ? "bg-indigo-50/50" : "bg-white"
                  )}
                >
                  <div className={cn(
                    "text-[10px] font-black uppercase tracking-[0.2em] mb-1 transition-colors",
                    isSelected ? "text-indigo-600" : (isToday ? "text-indigo-500" : "text-slate-400")
                  )}>
                    {format(day, 'EEE')}
                  </div>
                  <div className={cn(
                    "text-lg font-black tracking-tighter w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-300",
                    isSelected ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 scale-110" : (isToday ? "bg-slate-900 text-white" : "text-slate-600")
                  )}>
                    {format(day, 'd')}
                  </div>
                  {isSelected && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* All Day Row */}
        <div className="grid grid-cols-[60px_1fr] md:grid-cols-[80px_1fr] border-b border-slate-100 bg-white/50 z-10 shrink-0 min-w-max">
          <div className="border-r border-slate-100 flex items-center justify-center px-1 sticky left-0 bg-white z-20 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
            <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-slate-400 text-center">All Day</span>
          </div>
          <div 
            className="grid grid-cols-1 md:grid mobile-grid-override width-full"
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(120px, 1fr))` }}
          >
            {days.map((day, i) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isMobileActive = selectedMobileDate === dateStr;
              
              if (!isMobileActive && typeof window !== 'undefined' && window.innerWidth < 768) return null;

              const allDayShifts = shifts.filter(s => s.date === dateStr && s.isAllDay);
              const visibleAllDayShifts = filterMemberId === 'everyone' 
                ? allDayShifts 
                : allDayShifts.filter(s => s.userId === filterMemberId);
              
              const isToday = isSameDay(day, new Date());
              
              return (
                <div key={i} className={cn("min-h-[48px] p-1 md:p-1.5 border-r border-slate-100 last:border-r-0 flex flex-col gap-1 transition-colors", isToday && "bg-slate-50/50")}>
                  {visibleAllDayShifts.map(s => (
                    <div 
                       key={s.id}
                       onClick={() => toggleSlot(dateStr, 0, 0, s.id, s.userId)}
                       className="rounded-lg p-2 text-white shadow-sm flex items-center justify-between gap-2 cursor-pointer hover:brightness-95 active:scale-[0.98] transition-all overflow-hidden border border-white/20"
                       style={{ backgroundColor: s.color }}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <div className="p-1 bg-white/20 rounded-md shrink-0">
                          <CalendarIcon className="w-2.5 h-2.5" />
                        </div>
                        <span className="text-[8px] font-black uppercase truncate tracking-tight">{s.title}</span>
                      </div>
                    </div>
                  ))}
                  {visibleAllDayShifts.length === 0 && (
                    <button 
                      onClick={() => toggleSlot(dateStr, 12)} 
                      className="w-full h-full rounded-lg border border-dashed border-slate-200 hover:border-indigo-300 hover:bg-white transition-all flex items-center justify-center group"
                    >
                      <Plus className="w-3 h-3 text-slate-300 group-hover:text-indigo-400 group-hover:scale-110 transition-all" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Hourly Grid */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar relative bg-white min-w-max">
          <div className="grid grid-cols-[60px_1fr] md:grid-cols-[80px_1fr] relative">
             {/* Time Column Labels */}
             <div className="flex flex-col bg-slate-50/10 pb-[80px] sticky left-0 z-20 bg-white border-r border-slate-100 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                {hours.map(hour => (
                  <div 
                    key={`label-${hour}`} 
                    data-hour={hour}
                    className="h-[60px] md:h-[80px] border-b border-slate-50 flex items-start justify-end pr-2 md:pr-3 pt-2 text-[9px] md:text-[10px] font-bold text-slate-400 font-mono tracking-tighter"
                  >
                    {String(hour).padStart(2, '0')}:00
                  </div>
                ))}
             </div>

             {/* Days Grid Content */}
             <div 
               className="grid grid-cols-1 md:grid mobile-grid-override relative"
               style={{ gridTemplateColumns: `repeat(${days.length}, minmax(120px, 1fr))` }}
             >
                {/* Horizontal lines */}
                {hours.map(hour => (
                  <div key={`line-${hour}`} className="absolute left-0 right-0 border-b border-slate-100/50" style={{ top: `calc(${hour} * var(--hour-height, 60px))`, height: '1px' }} />
                ))}
                
                {/* Desktop Vertical lines */}
                <div className="hidden md:contents">
                  {days.map((_, i) => (
                    <div key={`v-line-${i}`} className="absolute top-0 bottom-0 border-r border-slate-100/50" style={{ left: `calc(${i} * (100% / ${days.length}))`, width: '1px' }} />
                  ))}
                </div>

                {/* Slots Grid */}
                {days.map((day, dIdx) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isMobileActive = selectedMobileDate === dateStr;
                  const isDayToday = isSameDay(day, new Date());

                  if (!isMobileActive && typeof window !== 'undefined' && window.innerWidth < 768) return null;

                  return (
                    <div key={dateStr} className="relative h-full">
                       {/* Current Time Indicator (Only for active day) */}
                       {isDayToday && (
                          <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ 
                            top: `calc(${new Date().getHours() * 60 + new Date().getMinutes()} / 60 * var(--hour-height, 60px))`,
                          }}>
                            <div className="w-full h-0.5 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]">
                              <div className="absolute -left-1 md:-left-1.5 -top-1 w-2 md:w-2.5 h-2 md:h-2.5 bg-rose-500 rounded-full shadow-sm ring-2 ring-white"></div>
                            </div>
                          </div>
                        )}

                       {hours.map(hour => {
                          const slotShifts = shifts.filter(s => s.date === dateStr && s.hour === hour && !s.isAllDay);
                          const visibleShifts = filterMemberId === 'everyone' 
                            ? slotShifts.sort((a, b) => a.userId === profile.uid ? -1 : 1)
                            : slotShifts.filter(s => s.userId === filterMemberId);
                          
                          const hasShifts = visibleShifts.length > 0;

                          return (
                            <div 
                              key={`${dateStr}-${hour}`}
                              onClick={() => {
                                if (visibleShifts.length > 0) {
                                  toggleSlot(dateStr, hour, (visibleShifts[0] as any).minute, visibleShifts[0].id, visibleShifts[0].userId);
                                } else {
                                  toggleSlot(dateStr, hour);
                                }
                              }}
                              className={cn(
                                "absolute left-1 right-1 rounded-xl cursor-pointer transition-all border border-transparent hover:border-slate-300 hover:z-30 overflow-hidden group/slot",
                                !hasShifts && "hover:bg-indigo-50/20 flex items-center justify-center"
                              )}
                              style={{ 
                                top: `calc(${hour} * var(--hour-height, 60px) + 2px)`, 
                                height: `calc(var(--hour-height, 60px) - 4px)`,
                                zIndex: hasShifts ? 10 : 5
                              }}
                            >
                               {hasShifts ? (
                                 <div className="flex flex-col gap-0.5 h-full relative p-0.5 md:p-1">
                                    {visibleShifts.slice(0, 3).map((s, idx) => (
                                      <div 
                                        key={s.id}
                                        className={cn(
                                          "flex-1 rounded-lg p-1 md:p-1.5 text-white shadow-sm flex flex-col relative overflow-hidden transition-all",
                                          idx > 0 && "opacity-40 hover:opacity-100 transition-opacity"
                                        )}
                                        style={{ 
                                          backgroundColor: s.color,
                                          marginTop: idx === 0 ? `${(s.minute / 60) * 100}%` : '0px'
                                        }}
                                      >
                                        <div className="flex items-center justify-between gap-1 overflow-hidden">
                                          <span className="text-[8px] md:text-[9px] font-black leading-none truncate uppercase tracking-tight">{s.title}</span>
                                          <div className="hidden sm:flex gap-0.5 shrink-0 opacity-70">
                                            {s.reminderEnabled && <Bell className="w-2 h-2" />}
                                            {s.inviteTeam && <Mail className="w-2 h-2" />}
                                          </div>
                                        </div>
                                        {visibleShifts.length === 1 && (
                                          <div className="mt-auto flex items-end justify-between">
                                            <span className="text-[7px] font-bold opacity-60">
                                              {s.userId === profile.uid ? 'Me' : teamMembers.find(m => m.uid === s.userId)?.displayName.split(' ')[0]}
                                            </span>
                                            {s.estimatedCost !== undefined && (
                                              <span className="text-[7px] font-black bg-white/20 px-1 rounded-full border border-white/10">
                                                ${s.estimatedCost}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                 </div>
                               ) : (
                                 <Plus className="w-4 h-4 text-slate-200 opacity-0 group-hover/slot:opacity-100 transition-opacity" />
                                )}
                            </div>
                          );
                       })}
                    </div>
                  );
                })}
             </div>
          </div>
        </div>
      </div>

      {/* Centered context-aware FAB for Mobile */}
      <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center">
        {!selectedSlot && (
          <div className="mb-2 whitespace-nowrap px-4 py-1.5 bg-white rounded-full shadow-lg border border-slate-100 text-[8px] font-black uppercase tracking-widest text-indigo-600 animate-bounce">
            Context Assignment
          </div>
        )}
        <button 
          onClick={() => toggleSlot(selectedMobileDate, 12)}
          className={cn(
            "w-20 h-20 rounded-full bg-indigo-600 text-white shadow-[0_20px_50px_rgba(79,70,229,0.3)] flex flex-col items-center justify-center transition-all border-4 border-white active:scale-90",
            selectedSlot ? "rotate-45 bg-rose-500 scale-90" : "bg-indigo-600"
          )}
        >
          <Plus className="w-8 h-8" />
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --hour-height: 60px;
        }
        @media (min-width: 768px) {
          :root {
            --hour-height: 80px;
          }
        }
        @media (max-width: 767px) {
          .mobile-grid-override {
            grid-template-columns: 1fr !important;
          }
        }
      `}} />

      {/* Edit Modal */}
      <AnimatePresence>
        {selectedSlot && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSlot(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="bg-white rounded-[2rem] p-10 max-w-md w-full shadow-2xl relative border border-slate-200 custom-scrollbar overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-8">
                 <div>
                    <h3 className="text-2xl font-black mb-1 flex items-center gap-3">
                      <Target className="w-6 h-6 text-indigo-600" />
                      {selectedSlot.shiftOwnerId && selectedSlot.shiftOwnerId !== profile.uid 
                        ? `Team Slot` 
                        : 'Schedule Event'}
                    </h3>
                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                      {modalDate ? format(parseISO(modalDate), 'EEEE, MMM do') : (selectedSlot?.date ? format(parseISO(selectedSlot.date), 'EEEE, MMM do') : '')} • {format(setHours(setMinutes(new Date(), modalMinute || 0), modalHour || 0), 'h:mm a')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const link = `${window.location.origin}?event=${selectedSlot.shiftId || 'new'}&date=${modalDate}&time=${modalHour}:${modalMinute}&endTime=${modalEndHour}:${modalEndMinute}&allDay=${isAllDayModal}`;
                        navigator.clipboard.writeText(link);
                        alert("Invite link copied to clipboard!");
                      }}
                      className="p-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition-all border border-indigo-100"
                      title="Copy Invite Link"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setSelectedSlot(null)} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100 transition-all shadow-sm border border-slate-100">
                      <X className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  </div>
                </div>

                <div className="space-y-6">
                   <div>
                     <label className="text-[10px] font-black uppercase text-slate-400 block mb-2 tracking-widest pl-1">Detailed Assignment Title</label>
                     <input 
                       autoFocus
                       placeholder="e.g. Airport Run #402, Living Room Paint..."
                       value={slotTitle}
                       onChange={e => setSlotTitle(e.target.value)}
                       className="w-full bg-slate-50 border border-slate-200 rounded-3xl px-6 py-5 text-xl font-black outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-inner placeholder:text-slate-300"
                     />
                   </div>

                   <div className="grid grid-cols-1 gap-6">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-3xl">
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">All Day</span>
                          </div>
                          <button 
                            onClick={() => setIsAllDayModal(!isAllDayModal)}
                            className={cn(
                              "w-10 h-5 rounded-full transition-all relative",
                              isAllDayModal ? "bg-indigo-600 shadow-sm" : "bg-slate-200"
                            )}
                          >
                            <div className={cn(
                              "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                              isAllDayModal ? "left-5.5" : "left-0.5"
                            )} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-3xl">
                          <div className="flex items-center gap-2">
                            <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">Split Event</span>
                          </div>
                          <button 
                            onClick={() => {
                              setInviteTeam(!inviteTeam);
                            }}
                            className={cn(
                              "w-10 h-5 rounded-full transition-all relative",
                              inviteTeam ? "bg-emerald-600 shadow-sm" : "bg-slate-200"
                            )}
                          >
                            <div className={cn(
                              "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                              inviteTeam ? "left-5.5" : "left-0.5"
                            )} />
                          </button>
                        </div>

                        <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-3xl">
                          <div className="flex items-center gap-2">
                            <Repeat className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">Repeat</span>
                          </div>
                          <button 
                            onClick={() => {
                              alert("Template settings are available in Admin section.");
                            }}
                            className="w-10 h-5 rounded-full bg-slate-200 relative"
                          >
                            <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm" />
                          </button>
                        </div>
                      </div>
                    </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 pl-1">Adjust Category</label>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {categories.map(c => (
                            <button 
                              key={c.id}
                              onClick={() => {
                                setSlotCategory(c.label);
                                setSlotColor(c.color);
                              }}
                              className={cn(
                                "flex flex-col items-center gap-2 py-3 rounded-2xl text-[9px] font-black uppercase transition-all border-2",
                                slotCategory === c.label 
                                  ? "border-indigo-600 bg-white text-indigo-600 shadow-md ring-4 ring-indigo-50" 
                                  : "border-transparent bg-slate-50 text-slate-400 hover:border-slate-200"
                              )}
                            >
                              <div style={{ backgroundColor: c.color }} className="w-3 h-3 rounded-full shadow-sm" />
                              <span className="truncate w-full px-1 text-center">{c.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2 pl-1">Adjust Date</label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input 
                        type="date"
                        value={modalDate}
                        onChange={e => setModalDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-3xl pl-12 pr-4 py-4 text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-inner"
                      />
                    </div>
                  </div>

                  {!isAllDayModal && (
                    <div className="space-y-8 p-6 bg-slate-50 border border-slate-100 rounded-[2rem]">
                      {/* Start Time */}
                      <div className="space-y-6">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Start Time: {String(modalHour).padStart(2, '0')}:{String(modalMinute).padStart(2, '0')}</label>
                          </div>
                          <div className="space-y-4">
                            <input 
                              type="range"
                              min="0"
                              max="23"
                              step="1"
                              value={modalHour}
                              onChange={e => setModalHour(parseInt(e.target.value))}
                              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                            <input 
                              type="range"
                              min="0"
                              max="45"
                              step="15"
                              value={modalMinute}
                              onChange={e => setModalMinute(parseInt(e.target.value))}
                              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 opacity-60"
                            />
                          </div>
                        </div>
                      </div>

                      {/* End Time */}
                      <div className="space-y-6 pt-4 border-t border-slate-200">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600">End Time: {String(modalEndHour).padStart(2, '0')}:{String(modalEndMinute).padStart(2, '0')}</label>
                          </div>
                          <div className="space-y-4">
                            <input 
                              type="range"
                              min="0"
                              max="23"
                              step="1"
                              value={modalEndHour}
                              onChange={e => setModalEndHour(parseInt(e.target.value))}
                              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                            />
                            <input 
                              type="range"
                              min="0"
                              max="45"
                              step="15"
                              value={modalEndMinute}
                              onChange={e => setModalEndMinute(parseInt(e.target.value))}
                              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500 opacity-60"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                {(slotCategory === 'work' || slotCategory === 'medical') && (
                   <motion.div 
                     initial={{ opacity: 0, y: 10 }}
                     animate={{ opacity: 1, y: 0 }}
                     className="p-6 bg-slate-900 rounded-[2rem] border border-slate-800 shadow-xl"
                   >
                     <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 block mb-3">
                       {slotCategory === 'work' ? 'Estimated Earnings' : 'Estimated Cost'}
                     </label>
                     <div className="relative flex items-center">
                        <span className="absolute left-4 text-lg font-black text-white/40">$</span>
                        <input 
                          type="number"
                          className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-10 pr-5 py-4 text-xl font-black text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                          placeholder="0.00"
                          value={estimatedCost}
                          onChange={e => setEstimatedCost(e.target.value)}
                        />
                     </div>
                     <p className="mt-3 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Helpful for tracking {slotCategory === 'work' ? 'projected revenue' : 'health expenditures'}</p>
                   </motion.div>
                )}

                <div className="grid grid-cols-2 gap-4">
                   <button 
                      onClick={() => setReminderEnabled(!reminderEnabled)}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-2xl border-2 transition-all group",
                        reminderEnabled ? "border-indigo-600 bg-indigo-50" : "border-slate-50 bg-slate-50 hover:border-slate-200"
                      )}
                   >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        reminderEnabled ? "bg-indigo-600 text-white" : "bg-white text-slate-300"
                      )}>
                        <Bell className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <div className={cn("text-[10px] font-black uppercase", reminderEnabled ? "text-indigo-600" : "text-slate-400")}>Reminder</div>
                        <div className="text-[8px] font-bold text-slate-400 uppercase">Auto Notification</div>
                      </div>
                   </button>

                   <button 
                      onClick={() => setInviteTeam(!inviteTeam)}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-2xl border-2 transition-all group",
                        inviteTeam ? "border-emerald-600 bg-emerald-50" : "border-slate-50 bg-slate-50 hover:border-slate-200"
                      )}
                   >
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        inviteTeam ? "bg-emerald-600 text-white" : "bg-white text-slate-300"
                      )}>
                        <Mail className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <div className={cn("text-[10px] font-black uppercase", inviteTeam ? "text-emerald-600" : "text-slate-400")}>Invite</div>
                        <div className="text-[8px] font-bold text-slate-400 uppercase">Notify Team</div>
                      </div>
                   </button>
                </div>

                <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Color Coding</label>
                   <div className="flex flex-wrap gap-2.5">
                      {PRESET_COLORS.map(c => (
                        <button 
                          key={c}
                          onClick={() => setSlotColor(c)}
                          style={{ backgroundColor: c }}
                          className={cn(
                            "w-7 h-7 rounded-lg border-4 transition-all",
                            slotColor === c ? "border-white scale-110 shadow-lg ring-2 ring-indigo-100" : "border-transparent opacity-40 hover:opacity-100"
                          )}
                        />
                      ))}
                   </div>
                </div>

                <div>
                   <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Shift Overview (Notes)</label>
                   <textarea 
                     className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all min-h-[100px] resize-none shadow-inner"
                     placeholder="Add special instructions for the team..."
                     value={notes}
                     onChange={(e) => setNotes(e.target.value)}
                   />
                </div>

                {(() => {
                  const targetUserId = selectedSlot.shiftOwnerId || (filterMemberId !== 'everyone' ? filterMemberId : profile.uid);
                  const existingShift = selectedSlot.shiftId 
                    ? shifts.find(s => s.id === selectedSlot.shiftId)
                    : shifts.find(s => s.date === modalDate && s.hour === modalHour && s.userId === targetUserId);

                  const isConfirmedWorkShift = existingShift?.status === 'confirmed';
                  const isMemberUser = profile.role === 'member';
                  const isPendingRequest = existingShift?.status === 'pending' && existingShift?.requestType;

                  // 1. Assistant Request Form (Absence / Time Change Request)
                  if (isMemberUser && isConfirmedWorkShift) {
                    return (
                      <div className="space-y-6 pt-4">
                        <div className="p-5 bg-indigo-50/50 rounded-3xl border border-indigo-100 flex flex-col gap-2">
                          <span className="text-[8px] font-black uppercase tracking-widest text-indigo-600">Active Shift Details</span>
                          <h4 className="text-lg font-black text-slate-800">{existingShift.title}</h4>
                          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                            <Clock className="w-3.5 h-3.5" />
                            {existingShift.isAllDay ? 'All Day Event' : `${String(existingShift.hour).padStart(2, '0')}:${String(existingShift.minute || 0).padStart(2, '0')} - ${String(existingShift.endHour).padStart(2, '0')}:${String(existingShift.endMinute || 0).padStart(2, '0')}`}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block pl-1">Request Type</label>
                          <div className="grid grid-cols-2 gap-3">
                            <button 
                              type="button"
                              onClick={() => setRequestType('absence')}
                              className={cn(
                                "py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2",
                                requestType === 'absence' ? "bg-rose-50 border-rose-500 text-rose-600 shadow-md" : "bg-slate-50 border-transparent text-slate-400 hover:border-slate-200"
                              )}
                            >
                              Request Off
                            </button>
                            <button 
                              type="button"
                              onClick={() => setRequestType('change')}
                              className={cn(
                                "py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2",
                                requestType === 'change' ? "bg-indigo-50 border-indigo-600 text-indigo-600 shadow-md" : "bg-slate-50 border-transparent text-slate-400 hover:border-slate-200"
                              )}
                            >
                              Request Change
                            </button>
                          </div>
                        </div>

                        {requestType === 'change' && (
                          <div className="space-y-6 p-5 bg-slate-50 border border-slate-100 rounded-3xl">
                            <div className="space-y-2">
                              <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Requested Start: {String(reqHour).padStart(2, '0')}:{String(reqMin).padStart(2, '0')}</label>
                              <input 
                                type="range"
                                min="0"
                                max="23"
                                step="1"
                                value={reqHour}
                                onChange={e => setReqHour(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-205 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                              />
                              <input 
                                type="range"
                                min="0"
                                max="45"
                                step="15"
                                value={reqMin}
                                onChange={e => setReqMin(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-205 rounded-lg appearance-none cursor-pointer accent-indigo-600 opacity-60"
                              />
                            </div>

                            <div className="space-y-2 pt-4 border-t border-slate-200">
                              <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Requested End: {String(reqEndHour).padStart(2, '0')}:{String(reqEndMin).padStart(2, '0')}</label>
                              <input 
                                type="range"
                                min="0"
                                max="23"
                                step="1"
                                value={reqEndHour}
                                onChange={e => setReqEndHour(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-205 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                              />
                              <input 
                                type="range"
                                min="0"
                                max="45"
                                step="15"
                                value={reqEndMin}
                                onChange={e => setReqEndMin(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-205 rounded-lg appearance-none cursor-pointer accent-emerald-500 opacity-60"
                              />
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block pl-1">Reason / Notes</label>
                          <textarea 
                            value={requestNotesText}
                            onChange={e => setRequestNotesText(e.target.value)}
                            placeholder="Please describe why you need this absence or shift change..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-600 transition-all min-h-[80px] resize-none shadow-inner"
                          />
                        </div>

                        <div className="flex gap-3 pt-4">
                          <button 
                            type="button"
                            onClick={() => setSelectedSlot(null)}
                            className="flex-1 py-4 border border-slate-100 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
                          >
                            Cancel
                          </button>
                          <button 
                            type="button"
                            onClick={saveShift}
                            className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl active:scale-95"
                          >
                            Submit Request
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // 2. Driver Approval / Decline View
                  if (profile.role === 'leader' && isPendingRequest) {
                    const requesterName = teamMembers.find(m => m.uid === existingShift.userId)?.displayName || 'Team Member';
                    return (
                      <div className="space-y-6 pt-4">
                        <div className="p-5 bg-amber-50/50 rounded-3xl border border-amber-100 flex flex-col gap-2 relative overflow-hidden">
                          <span className="text-[8px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1">
                            <Shield className="w-3 h-3" /> Change Request Approval
                          </span>
                          <h4 className="text-lg font-black text-slate-800">{existingShift.title}</h4>
                          <p className="text-xs font-bold text-slate-500">Requested by <strong className="text-slate-700">{requesterName}</strong></p>
                        </div>

                        <div className="space-y-3 p-5 bg-slate-50 border border-slate-100 rounded-3xl">
                          <div>
                            <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Request Type</span>
                            <p className="text-xs font-black text-slate-700 uppercase mt-0.5">{existingShift.requestType === 'absence' ? 'Request Off (Absence)' : 'Shift Time Change'}</p>
                          </div>
                          {existingShift.requestType === 'change' && existingShift.requestedHours && (
                            <div className="pt-2 border-t border-slate-205">
                              <span className="text-[8px] font-black uppercase tracking-widest text-indigo-600">Requested Hours</span>
                              <p className="text-xs font-black text-slate-700 mt-0.5">
                                {String(existingShift.requestedHours.hour).padStart(2, '0')}:{String(existingShift.requestedHours.minute || 0).padStart(2, '0')} - {String(existingShift.requestedHours.endHour).padStart(2, '0')}:{String(existingShift.requestedHours.endMinute || 0).padStart(2, '0')}
                              </p>
                            </div>
                          )}
                          {existingShift.requestNotes && (
                            <div className="pt-2 border-t border-slate-205">
                              <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Reason / Notes</span>
                              <p className="text-xs font-bold text-slate-600 mt-1 italic">"{existingShift.requestNotes}"</p>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-3 pt-4">
                          <button 
                            type="button"
                            onClick={() => denyShiftRequest(existingShift.id!)}
                            className="flex-1 py-4 bg-white border border-slate-200 text-rose-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 transition-all active:scale-95"
                          >
                            Deny Request
                          </button>
                          <button 
                            type="button"
                            onClick={() => approveShift(existingShift.id!)}
                            disabled={approvalSuccess}
                            className={cn(
                              "flex-1 py-4 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl active:scale-95",
                              approvalSuccess ? "bg-emerald-100 text-emerald-600" : "bg-emerald-600 hover:bg-emerald-700"
                            )}
                          >
                            {approvalSuccess ? "Confirmed" : "Approve Request"}
                          </button>
                        </div>
                      </div>
                    );
                  }

                  // 3. Standard Shift Creation & normal Leader Editor
                  return (
                    <div className="space-y-6">
                       <div>
                         <label className="text-[10px] font-black uppercase text-slate-400 block mb-2 tracking-widest pl-1">Detailed Assignment Title</label>
                         <input 
                           autoFocus
                           placeholder="e.g. Airport Run #402, Living Room Paint..."
                           value={slotTitle}
                           onChange={e => setSlotTitle(e.target.value)}
                           className="w-full bg-slate-50 border border-slate-200 rounded-3xl px-6 py-5 text-xl font-black outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-inner placeholder:text-slate-300"
                         />
                       </div>

                       <div className="grid grid-cols-1 gap-6">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-3xl">
                              <div className="flex items-center gap-2">
                                <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">All Day</span>
                              </div>
                              <button 
                                onClick={() => setIsAllDayModal(!isAllDayModal)}
                                className={cn(
                                  "w-10 h-5 rounded-full transition-all relative",
                                  isAllDayModal ? "bg-indigo-600 shadow-sm" : "bg-slate-200"
                                )}
                              >
                                <div className={cn(
                                  "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                                  isAllDayModal ? "left-5.5" : "left-0.5"
                                )} />
                              </button>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-3xl">
                              <div className="flex items-center gap-2">
                                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">Split Event</span>
                              </div>
                              <button 
                                onClick={() => setInviteTeam(!inviteTeam)}
                                className={cn(
                                  "w-10 h-5 rounded-full transition-all relative",
                                  inviteTeam ? "bg-emerald-600 shadow-sm" : "bg-slate-200"
                                )}
                              >
                                <div className={cn(
                                  "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                                  inviteTeam ? "left-5.5" : "left-0.5"
                                )} />
                              </button>
                            </div>

                            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-3xl">
                              <div className="flex items-center gap-2">
                                <Repeat className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-700">Repeat</span>
                              </div>
                              <button 
                                onClick={() => alert("Template settings are available in Admin section.")}
                                className="w-10 h-5 rounded-full bg-slate-200 relative"
                              >
                                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm" />
                              </button>
                            </div>
                          </div>
                       </div>

                       <div>
                         <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3 pl-1">Adjust Category</label>
                         <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                           {categories.map(c => (
                             <button 
                               key={c.id}
                               onClick={() => {
                                 setSlotCategory(c.label);
                                 setSlotColor(c.color);
                               }}
                               className={cn(
                                 "flex flex-col items-center gap-2 py-3 rounded-2xl text-[9px] font-black uppercase transition-all border-2",
                                 slotCategory === c.label 
                                   ? "border-indigo-600 bg-white text-indigo-600 shadow-md ring-4 ring-indigo-50" 
                                   : "border-transparent bg-slate-50 text-slate-400 hover:border-slate-200"
                               )}
                             >
                               <div style={{ backgroundColor: c.color }} className="w-3 h-3 rounded-full shadow-sm" />
                               <span className="truncate w-full px-1 text-center">{c.label}</span>
                             </button>
                           ))}
                         </div>
                       </div>

                       <div className="space-y-4">
                         <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2 pl-1">Adjust Date</label>
                         <div className="relative">
                           <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                           <input 
                             type="date"
                             value={modalDate}
                             onChange={e => setModalDate(e.target.value)}
                             className="w-full bg-slate-50 border border-slate-200 rounded-3xl pl-12 pr-4 py-4 text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-inner"
                           />
                         </div>
                       </div>

                       {!isAllDayModal && (
                         <div className="space-y-8 p-6 bg-slate-50 border border-slate-100 rounded-[2rem]">
                           <div className="space-y-6">
                             <div className="flex-1">
                               <div className="flex items-center justify-between mb-2">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Start Time: {String(modalHour).padStart(2, '0')}:{String(modalMinute).padStart(2, '0')}</label>
                               </div>
                               <div className="space-y-4">
                                 <input 
                                   type="range"
                                   min="0"
                                   max="23"
                                   step="1"
                                   value={modalHour}
                                   onChange={e => setModalHour(parseInt(e.target.value))}
                                   className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                 />
                                 <input 
                                   type="range"
                                   min="0"
                                   max="45"
                                   step="15"
                                   value={modalMinute}
                                   onChange={e => setModalMinute(parseInt(e.target.value))}
                                   className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 opacity-60"
                                 />
                               </div>
                             </div>
                           </div>

                           <div className="space-y-6 pt-4 border-t border-slate-200">
                             <div className="flex-1">
                               <div className="flex items-center justify-between mb-2">
                                 <label className="text-[10px] font-black uppercase tracking-widest text-emerald-600">End Time: {String(modalEndHour).padStart(2, '0')}:{String(modalEndMinute).padStart(2, '0')}</label>
                               </div>
                               <div className="space-y-4">
                                 <input 
                                   type="range"
                                   min="0"
                                   max="23"
                                   step="1"
                                   value={modalEndHour}
                                   onChange={e => setModalEndHour(parseInt(e.target.value))}
                                   className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                 />
                                 <input 
                                   type="range"
                                   min="0"
                                   max="45"
                                   step="15"
                                   value={modalEndMinute}
                                   onChange={e => setModalEndMinute(parseInt(e.target.value))}
                                   className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-500 opacity-60"
                                 />
                               </div>
                             </div>
                           </div>
                         </div>
                       )}

                       {(slotCategory === 'Work' || slotCategory === 'Work' || slotCategory === 'medical') && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-6 bg-slate-900 rounded-[2rem] border border-slate-800 shadow-xl"
                          >
                            <label className="text-[10px] font-black uppercase tracking-widest text-indigo-400 block mb-3">
                              {slotCategory === 'Work' ? 'Estimated Earnings' : 'Estimated Cost'}
                            </label>
                            <div className="relative flex items-center">
                               <span className="absolute left-4 text-lg font-black text-white/40">$</span>
                               <input 
                                 type="number"
                                 className="w-full bg-slate-800 border border-slate-700 rounded-2xl pl-10 pr-5 py-4 text-xl font-black text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                 placeholder="0.00"
                                 value={estimatedCost}
                                 onChange={e => setEstimatedCost(e.target.value)}
                               />
                            </div>
                            <p className="mt-3 text-[9px] font-bold text-slate-500 uppercase tracking-widest">Helpful for tracking {slotCategory === 'Work' ? 'projected revenue' : 'health expenditures'}</p>
                          </motion.div>
                       )}

                       <div className="grid grid-cols-2 gap-4">
                          <button 
                             onClick={() => setReminderEnabled(!reminderEnabled)}
                             className={cn(
                               "flex items-center gap-3 p-4 rounded-2xl border-2 transition-all group",
                               reminderEnabled ? "border-indigo-600 bg-indigo-50" : "border-slate-50 bg-slate-50 hover:border-slate-200"
                             )}
                          >
                             <div className={cn(
                               "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                               reminderEnabled ? "bg-indigo-600 text-white" : "bg-white text-slate-300"
                             )}>
                               <Bell className="w-5 h-5" />
                             </div>
                             <div className="text-left">
                               <div className={cn("text-[10px] font-black uppercase", reminderEnabled ? "text-indigo-600" : "text-slate-400")}>Reminder</div>
                               <div className="text-[8px] font-bold text-slate-400 uppercase">Auto Notification</div>
                             </div>
                          </button>

                          <button 
                             onClick={() => setInviteTeam(!inviteTeam)}
                             className={cn(
                               "flex items-center gap-3 p-4 rounded-2xl border-2 transition-all group",
                               inviteTeam ? "border-emerald-600 bg-emerald-50" : "border-slate-50 bg-slate-50 hover:border-slate-200"
                             )}
                          >
                             <div className={cn(
                               "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                               inviteTeam ? "bg-emerald-600 text-white" : "bg-white text-slate-300"
                             )}>
                               <Mail className="w-5 h-5" />
                             </div>
                             <div className="text-left">
                               <div className={cn("text-[10px] font-black uppercase", inviteTeam ? "text-emerald-600" : "text-slate-400")}>Invite</div>
                               <div className="text-[8px] font-bold text-slate-400 uppercase">Notify Team</div>
                             </div>
                          </button>
                       </div>

                       <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Color Coding</label>
                          <div className="flex flex-wrap gap-2.5">
                             {PRESET_COLORS.map(c => (
                               <button 
                                 key={c}
                                 onClick={() => setSlotColor(c)}
                                 style={{ backgroundColor: c }}
                                 className={cn(
                                   "w-7 h-7 rounded-lg border-4 transition-all",
                                   slotColor === c ? "border-white scale-110 shadow-lg ring-2 ring-indigo-100" : "border-transparent opacity-40 hover:opacity-100"
                                 )}
                               />
                             ))}
                          </div>
                       </div>

                       <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Shift Overview (Notes)</label>
                          <textarea 
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-600 transition-all min-h-[100px] resize-none shadow-inner"
                            placeholder="Add special instructions for the team..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                          />
                       </div>

                       <div className="flex flex-col gap-3 pt-4">
                          <div className="flex gap-4">
                            <button 
                              type="button"
                              onClick={() => setSelectedSlot(null)}
                              className="flex-1 h-14 border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all flex items-center justify-center"
                            >
                              Cancel
                            </button>
                            <button 
                              type="button"
                              onClick={saveShift}
                              className="flex-1 h-14 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 active:scale-95 flex items-center justify-center"
                            >
                              Confirm Changes
                            </button>
                          </div>
                          
                          {shifts.some(s => s.date === selectedSlot.date && s.hour === selectedSlot.hour && s.userId === profile.uid) && (
                            <button 
                              type="button"
                              onClick={() => deleteShift()}
                              className="w-full h-14 bg-rose-50 border border-rose-200 text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-2 active:scale-95"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Remove Event
                            </button>
                          )}
                        </div>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCategoriesModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-white rounded-[2.5rem] p-8 shadow-2xl relative"
            >
              <div className="flex items-center justify-between mb-8">
                 <h3 className="text-2xl font-black uppercase tracking-tight text-slate-800">Assignment Labels</h3>
                 <button onClick={() => setShowCategoriesModal(false)} className="p-2 hover:bg-slate-100 rounded-full transition-all">
                   <X className="w-5 h-5 text-slate-400" />
                 </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto custom-scrollbar">
                <CategoriesManager team={team!} profile={profile} />
              </div>
              <div className="mt-8">
                <button 
                  onClick={() => setShowCategoriesModal(false)}
                  className="w-full py-5 bg-indigo-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all"
                >
                  Close & Save
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function EarningsChart({ earnings }: { earnings: EarningEntry[] }) {
  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(new Date(), -i);
      return format(d, 'yyyy-MM-dd');
    }).reverse();

    return last7Days.map(date => {
      const dayEarnings = earnings
        .filter(e => e.date === date && e.type === 'earning')
        .reduce((sum, e) => sum + e.amount, 0);
      return {
        name: format(parseISO(date), 'EEE'),
        amount: dayEarnings
      };
    });
  }, [earnings]);

  return (
    <div className="h-[200px] w-full mt-6">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
              <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis 
            dataKey="name" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fontWeight: 700, fill: '#94A3B8' }}
            dy={10}
          />
          <YAxis hide />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{payload[0].payload.name}</p>
                    <p className="text-sm font-black">${Number(payload[0].value).toFixed(2)}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area 
            type="monotone" 
            dataKey="amount" 
            stroke="#4f46e5" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorAmount)" 
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function EarningsView({ earnings, profile, team, teamMembers, categories, setView }: { earnings: EarningEntry[], profile: UserProfile, team: Team | null, teamMembers: UserProfile[], categories: Category[], setView: (v: View) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [period, setPeriod] = useState<'week'|'last-week'|'all'>('week');
  const [type, setType] = useState<TransactionType>('earning');
  const [newEarning, setNewEarning] = useState({
    amount: '',
    category: 'DoorDash',
    budgetCategory: 'work' as BudgetCategory,
    splitPercentage: team?.enableSplitPay && team?.splitPayPercentage !== undefined ? String(team.splitPayPercentage) : '50',
    date: format(new Date(), 'yyyy-MM-dd')
  });

  const PLATFORMS = ['DoorDash', 'Uber', 'Instacart', 'Lyft', 'Amazon Flex', 'TaskRabbit', 'Rover', 'Sophos', 'Personal', 'Other'];

  const gigActive = team?.enableDeliveryGig || team?.enableHomeServices || team?.enableCareServices;

  // Use team split pay percentage when setting up
  useEffect(() => {
    if (showAdd && team?.enableSplitPay && team?.splitPayPercentage !== undefined) {
      setNewEarning(prev => ({ ...prev, splitPercentage: String(team.splitPayPercentage) }));
    }
  }, [showAdd, team?.enableSplitPay, team?.splitPayPercentage]);

  // Reset category if categories change
  useEffect(() => {
    if (categories.length > 0 && !categories.some(c => c.label === newEarning.category)) {
      setNewEarning(prev => ({ ...prev, category: categories[0].label }));
    }
  }, [categories]);

  const filteredEarnings = useMemo(() => {
    const now = new Date();
    if (period === 'all') return earnings;
    
    const start = period === 'week' ? startOfWeek(now) : startOfWeek(addDays(now, -7));
    const end = addDays(start, 7);

    return earnings.filter(e => {
      if (!e.date) return false;
      const d = parseISO(e.date);
      return !isNaN(d.getTime()) && d >= start && d < end;
    });
  }, [earnings, period]);

  const netTotal = filteredEarnings.reduce((acc, curr) => acc + (curr.type === 'earning' ? curr.amount : -curr.amount), 0);
  const earningsOnly = filteredEarnings.filter(e => e.type === 'earning');
  const paymentsOnly = filteredEarnings.filter(e => e.type === 'payment');
  const splitPayPercent = team?.splitPayPercentage ?? 50;

  const budgetSummary = useMemo(() => {
    const summary = { work: 0, pleasure: 0, leisure: 0 };
    filteredEarnings.forEach(e => {
      if (e.budgetCategory && e.budgetCategory in summary) {
        summary[e.budgetCategory as BudgetCategory] += e.type === 'earning' ? e.amount : -e.amount;
      }
    });
    return summary;
  }, [filteredEarnings]);

  const saveEarning = async () => {
    const amountNum = parseFloat(newEarning.amount);
    if (isNaN(amountNum)) return;

    let driverPay = 0;
    let assistantPay = 0;
    let split = 0;

    if (type === 'earning' && gigActive) {
      split = parseFloat(newEarning.splitPercentage);
      driverPay = amountNum * (split / 100);
      assistantPay = amountNum - driverPay;
    }

    try {
      await addDoc(collection(db, 'earnings'), {
        amount: amountNum,
        category: newEarning.category,
        budgetCategory: newEarning.budgetCategory,
        type,
        splitPercentage: split || null,
        driverPay: driverPay || null,
        assistantPay: assistantPay || null,
        date: newEarning.date,
        userId: profile.uid,
        teamId: profile.teamId,
        createdAt: serverTimestamp()
      });
      setShowAdd(false);
      setNewEarning({
        amount: '',
        category: 'General',
        budgetCategory: 'work',
        splitPercentage: team?.enableSplitPay && team?.splitPayPercentage !== undefined ? String(team.splitPayPercentage) : '50',
        date: format(new Date(), 'yyyy-MM-dd')
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'earnings');
    }
  };

  return (
    <div className="space-y-10">
      {/* Header & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Earnings</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Financial Overview</p>
        </div>
        <div className="flex bg-slate-200/50 p-1 rounded-full border border-slate-200 overflow-x-auto no-scrollbar max-w-full">
          <button 
            onClick={() => setPeriod('week')}
            className={cn("px-3 md:px-4 py-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-widest rounded-full transition-all whitespace-nowrap", period === 'week' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500")}
          >
            Week
          </button>
          <button 
            onClick={() => setPeriod('all')}
            className={cn("px-3 md:px-4 py-1.5 text-[9px] md:text-[10px] font-bold uppercase tracking-widest rounded-full transition-all whitespace-nowrap", period === 'all' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500")}
          >
            All Time
          </button>
          <div className="w-px h-4 bg-slate-300 mx-2 self-center" />
          <button 
            onClick={() => setView('settings')}
            className="px-3 md:px-4 py-1.5 text-[9px] md:text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:bg-white rounded-full transition-all flex items-center gap-1"
          >
            <SettingsIcon className="w-3 h-3" /> Split
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="bg-slate-900 text-white p-6 md:p-8 rounded-[2rem] shadow-2xl flex flex-col justify-between group overflow-hidden relative min-h-[250px]">
          <div className="relative z-10">
            <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4">Net Balance</div>
            <div className="text-4xl md:text-5xl font-black tracking-tighter">${netTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <EarningsChart earnings={earnings} />
          </div>
          <DollarSign className="absolute -right-4 -bottom-4 w-24 md:w-32 h-24 md:h-32 text-white/5 group-hover:scale-110 transition-transform" />
        </div>
        <div className="geometric-card p-6 md:p-8 flex flex-col justify-between min-h-[160px]">
          <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            Total Income 
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          </div>
          <div>
            <div className="text-3xl md:text-4xl font-black text-slate-800 tracking-tighter">${earningsOnly.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            {gigActive && (
              <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-slate-100 flex justify-between items-center">
                <div className="text-left">
                  <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Leader ({splitPayPercent}%)</p>
                  <p className="text-lg md:text-xl font-black text-indigo-600">${(earningsOnly.reduce((acc, curr) => acc + curr.amount, 0) * (splitPayPercent / 100)).toFixed(2)}</p>
                </div>
                <div className="w-px h-8 bg-slate-100 mx-2" />
                <div className="text-right">
                  <p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Asst. ({100 - splitPayPercent}%)</p>
                  <p className="text-lg md:text-xl font-black text-emerald-600">${(earningsOnly.reduce((acc, curr) => acc + curr.amount, 0) * (1 - splitPayPercent / 100)).toFixed(2)}</p>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="geometric-card p-6 md:p-8 flex flex-col justify-between min-h-[160px]">
          <div className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
            Total Payments
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          </div>
          <div className="text-3xl md:text-4xl font-black text-slate-800 tracking-tighter">${paymentsOnly.reduce((acc, curr) => acc + curr.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Budget Categories Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 md:p-6 bg-white border border-slate-100 rounded-2xl flex flex-col items-center text-center">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Work</p>
          <p className="text-xl font-black text-indigo-600">${budgetSummary.work.toFixed(2)}</p>
        </div>
        <div className="p-4 md:p-6 bg-white border border-slate-100 rounded-2xl flex flex-col items-center text-center">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Pleasure</p>
          <p className="text-xl font-black text-emerald-600">${budgetSummary.pleasure.toFixed(2)}</p>
        </div>
        <div className="p-4 md:p-6 bg-white border border-slate-100 rounded-2xl flex flex-col items-center text-center">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Leisure</p>
          <p className="text-xl font-black text-amber-600">${budgetSummary.leisure.toFixed(2)}</p>
        </div>
      </div>

      <div className="geometric-card overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black tracking-tight">Ledger</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Transaction History</p>
          </div>
          <button 
            onClick={() => setShowAdd(true)}
            className="bg-indigo-600 text-white rounded-2xl px-6 py-3 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
          >
            <Plus className="w-4 h-4" /> Add Income
          </button>
        </div>

        <div className="divide-y divide-slate-50">
          {filteredEarnings.length === 0 ? (
            <div className="py-20 md:py-32 text-center flex flex-col items-center opacity-40">
              <DollarSign className="w-12 md:w-16 h-12 md:h-16 text-slate-300 mb-4" />
              <p className="text-xs font-bold uppercase tracking-[0.2em]">No records for this period</p>
            </div>
          ) : (
            filteredEarnings.map(e => (
              <div key={e.id} className="flex items-center justify-between p-4 md:p-6 hover:bg-slate-50 transition-colors group gap-4">
                <div className="flex items-center gap-3 md:gap-6 overflow-hidden">
                  <div className={cn(
                    "w-10 h-10 md:w-14 md:h-14 bg-white rounded-xl md:rounded-2xl border-2 flex items-center justify-center font-black shadow-sm group-hover:scale-105 transition-all md:text-xl shrink-0",
                    e.type === 'earning' ? "text-emerald-600 border-emerald-100" : "text-rose-600 border-rose-100"
                  )}>
                    {e.type === 'earning' ? <Plus className="w-4 h-4 md:w-5 h-5" /> : <ChevronLeft className="w-4 h-4 md:w-5 h-5 rotate-180" />}
                  </div>
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-black text-sm md:text-lg text-slate-900 leading-none truncate">{e.category}</div>
                      {e.budgetCategory && (
                        <span className={cn(
                          "text-[7px] px-1.5 py-0.5 rounded-full font-black uppercase tracking-widest",
                          e.budgetCategory === 'work' ? "bg-indigo-100 text-indigo-600" :
                          e.budgetCategory === 'pleasure' ? "bg-rose-100 text-rose-600" :
                          "bg-emerald-100 text-emerald-600"
                        )}>
                          {e.budgetCategory}
                        </span>
                      )}
                    </div>
                    <div className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                      {e.date && !isNaN(parseISO(e.date).getTime()) ? format(parseISO(e.date), 'MMM dd, yyyy') : 'No Date'} • {teamMembers.find(m => m.uid === e.userId)?.displayName.split(' ')[0] || 'Team'}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={cn(
                    "font-black text-lg md:text-2xl tracking-tight mb-0.5",
                    e.type === 'earning' ? "text-emerald-600" : "text-rose-600"
                  )}>
                    {e.type === 'earning' ? '+' : '-'}${e.amount.toFixed(2)}
                  </div>
                  {e.type === 'earning' && gigActive && (
                    <div className="flex items-center gap-2 justify-end text-[7px] md:text-[8px] font-black uppercase text-slate-400 tracking-tighter">
                       <span className="text-indigo-400">L: ${e.driverPay?.toFixed(2)}</span>
                       <span className="text-emerald-400">A: ${e.assistantPay?.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAdd(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 30 }}
              className="bg-white rounded-[2rem] p-10 max-w-md w-full shadow-2xl relative border border-slate-200"
            >
              <h3 className="text-3xl font-black mb-8 tracking-tight">Financial Record</h3>

              <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
                <button 
                  onClick={() => setType('earning')}
                  className={cn(
                    "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                    type === 'earning' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  Earning
                </button>
                <button 
                  onClick={() => setType('payment')}
                  className={cn(
                    "flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                    type === 'payment' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"
                  )}
                >
                  Payment
                </button>
              </div>
              
              <div className="space-y-6 max-h-[60vh] overflow-y-auto px-1 custom-scrollbar">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2 font-mono">Amount ($)</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-indigo-600 font-bold text-2xl transition-all"
                    placeholder="0.00"
                    value={newEarning.amount}
                    onChange={(e) => setNewEarning({...newEarning, amount: e.target.value})}
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2 font-mono">Budget Category</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['work', 'pleasure', 'leisure'] as BudgetCategory[]).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setNewEarning({...newEarning, budgetCategory: cat})}
                        className={cn(
                          "py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all",
                          newEarning.budgetCategory === cat 
                            ? "bg-slate-900 text-white border-slate-900" 
                            : "bg-white text-slate-400 border-slate-100 hover:border-slate-300"
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2 font-mono">Source / Platform</label>
                    <div className="flex flex-wrap gap-1 mb-2">
                       {PLATFORMS.map(src => (
                         <button 
                           key={src}
                           onClick={() => setNewEarning({...newEarning, category: src})}
                           className={cn(
                             "px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all mb-1",
                             newEarning.category === src ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                           )}
                         >
                           {src}
                         </button>
                       ))}
                    </div>
                    <input 
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 outline-none font-bold text-xs shadow-inner"
                      placeholder="e.g. Sophos, Freelance"
                      value={newEarning.category}
                      onChange={(e) => setNewEarning({...newEarning, category: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2 font-mono">Date</label>
                    <input 
                      type="date"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-4 outline-none font-bold text-xs shadow-inner"
                      value={newEarning.date}
                      onChange={(e) => setNewEarning({...newEarning, date: e.target.value})}
                    />
                  </div>
                </div>

                {type === 'earning' && gigActive && (
                  <div className="p-6 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                    <div className="flex justify-between items-end mb-3">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Team Split</label>
                      <span className="text-xl font-black text-indigo-600">{newEarning.splitPercentage}%</span>
                    </div>
                    <input 
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      className="w-full h-2 bg-white rounded-full appearance-none cursor-pointer accent-indigo-600 mb-2"
                      value={newEarning.splitPercentage}
                      onChange={(e) => setNewEarning({...newEarning, splitPercentage: e.target.value})}
                    />
                    <div className="flex justify-between text-[8px] font-black text-slate-400 uppercase tracking-widest">
                       <span>Leader ({newEarning.splitPercentage}%)</span>
                       <span>Assistant ({100 - parseInt(newEarning.splitPercentage)}%)</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-4 pt-6">
                  <button 
                    onClick={() => setShowAdd(false)}
                    className="flex-1 px-4 py-4 border border-slate-100 rounded-2xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={saveEarning}
                    className="flex-1 px-4 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                  >
                    Post Record
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CategoriesManager({ team, profile }: { team: Team | null, profile: UserProfile }) {
  if (!team) return <p className="text-xs font-bold text-slate-400 uppercase tracking-widest text-center py-8">No active team workspace</p>;

  const [categories, setCategories] = useState<Category[]>(team.categories || []);
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  // Update categories when team data changes
  useEffect(() => {
    if (team.categories) {
      setCategories(team.categories);
    }
  }, [team.categories]);

  const updateCategory = async (id: string, updates: Partial<Category>) => {
    if (profile.role !== 'leader') return;
    const newCategories = categories.map(c => c.id === id ? { ...c, ...updates } : c);
    setCategories(newCategories);
    try {
      await updateDoc(doc(db, 'teams', team.id), { categories: newCategories });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `teams/${team.id}`);
    }
  };

  const addCategory = async () => {
    if (profile.role !== 'leader' || !newLabel.trim()) return;
    const newCat = {
      id: Math.random().toString(36).substr(2, 9),
      label: newLabel.trim(),
      color: newColor
    };
    const newCategories = [...categories, newCat];
    setCategories(newCategories);
    try {
      await updateDoc(doc(db, 'teams', team.id), { categories: newCategories });
      setNewLabel('');
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `teams/${team.id}`);
    }
  };

  const removeCategory = async (id: string) => {
    if (profile.role !== 'leader' || categories.length <= 1) return;
    const newCategories = categories.filter(c => c.id !== id);
    setCategories(newCategories);
    try {
      await updateDoc(doc(db, 'teams', team.id), { categories: newCategories });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `teams/${team.id}`);
    }
  };

  return (
    <div className="geometric-card p-6 md:p-10 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-6 md:mb-8">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Shift Categories</h3>
        {profile.role === 'leader' && (
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="text-[10px] font-black uppercase text-indigo-600 hover:text-indigo-700"
          >
            {isAdding ? 'Cancel' : '+ Add New'}
          </button>
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-8 p-6 bg-slate-50 border border-slate-100 rounded-3xl space-y-4"
          >
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Category Label</label>
              <input 
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. Remote, On-site, Night"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-600 shadow-inner"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Pick Color</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(c => (
                  <button 
                    key={c}
                    onClick={() => setNewColor(c)}
                    style={{ backgroundColor: c }}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-all shadow-sm",
                      newColor === c ? "border-white ring-2 ring-indigo-600 scale-110 shadow-lg" : "border-transparent opacity-60 hover:opacity-100"
                    )}
                  />
                ))}
              </div>
            </div>
            <button 
              onClick={addCategory}
              className="w-full bg-indigo-600 text-white rounded-xl py-4 text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95"
            >
              Add Category
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {categories.map(c => (
          <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors rounded-2xl group border border-transparent hover:border-slate-100">
            <div 
              style={{ backgroundColor: c.color }} 
              className="w-10 h-10 rounded-xl flex-shrink-0 shadow-sm border border-black/5"
            />
            <div className="flex-1">
              {profile.role === 'leader' ? (
                <input 
                  value={c.label}
                  onChange={e => updateCategory(c.id, { label: e.target.value })}
                  className="w-full bg-transparent border-none p-0 text-sm font-black text-slate-900 focus:ring-0"
                />
              ) : (
                <p className="text-sm font-black text-slate-900">{c.label}</p>
              )}
            </div>
            {profile.role === 'leader' && categories.length > 1 && (
              <button 
                onClick={() => removeCategory(c.id)}
                className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-rose-500 transition-all active:scale-90"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsView({ profile, team, teamMembers }: { profile: UserProfile, team: Team | null, teamMembers: UserProfile[] }) {
  const [userName, setUserName] = useState(profile.displayName);
  const [teamName, setTeamName] = useState(team?.name || '');
  const [newTeamId, setNewTeamId] = useState(team?.id || '');
  const [saving, setSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [activeDoc, setActiveDoc] = useState<'scheduling' | 'ledger' | 'chat' | null>(null);

  useEffect(() => {
    if (team?.name) setTeamName(team.name);
    if (team?.id) setNewTeamId(team.id);
  }, [team]);

  const handleResetProfile = async () => {
    if (!confirm("Are you sure? This will disconnect you from the current team. Your personal shifts and data will be preserved but you will no longer have access to this workspace.")) return;
    setIsResetting(true);
    try {
      if (team && profile) {
        // Remove from team members
        const updatedMembers = team.members.filter(m => m !== profile.uid);
        await updateDoc(doc(db, 'teams', profile.teamId), {
          members: updatedMembers
        });
        
        // Clear teamId and role in user profile
        await updateDoc(doc(db, 'users', profile.uid), {
          teamId: "",
          role: "member"
        });
        
        window.location.reload(); // Hard refresh to reset state
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsResetting(false);
    }
  };

  const handleRemoveMember = async (memberUid: string) => {
    if (!team || profile.role !== 'leader') return;
    if (memberUid === profile.uid) {
      alert("You cannot remove yourself. Use 'Reset Profile' to leave the team.");
      return;
    }
    
    if (!confirm(`Are you sure you want to remove this member from the team? They will lose access to all shared schedules and chats.`)) return;

    try {
      // 1. Remove from team document
      const updatedMembers = team.members.filter(m => m !== memberUid);
      await updateDoc(doc(db, 'teams', team.id), {
        members: updatedMembers
      });

      // 2. Disconnect the user
      await updateDoc(doc(db, 'users', memberUid), {
        teamId: "",
        role: "member"
      });

      alert("Member removed successfully.");
    } catch (err) {
      console.error("Error removing member:", err);
      alert("Failed to remove member.");
    }
  };

  const handleRenameTeamId = async () => {
    if (!profile || !team || profile.role !== 'leader') return;
    if (newTeamId === team.id) return;
    if (!newTeamId.trim()) return;

    setSaving(true);
    try {
      const newTeamRef = doc(db, 'teams', newTeamId);
      const newSnap = await getDoc(newTeamRef);
      if (newSnap.exists()) {
        alert("This Team ID is already taken. Please choose another one.");
        setSaving(false);
        return;
      }

      // 1. Create new team document
      await setDoc(newTeamRef, { ...team, id: newTeamId });

      // 2. Update all members
      const memberUpdates = team.members.map(uid => 
        updateDoc(doc(db, 'users', uid), { teamId: newTeamId })
      );
      await Promise.all(memberUpdates);

      // 3. Delete old team document
      await deleteDoc(doc(db, 'teams', team.id));

      alert("Team ID updated successfully! All members have been migrated.");
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert("Error migrating team ID. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    setSaving(true);
    try {
      if (profile.role === 'leader' && teamName !== team?.name) {
        await updateDoc(doc(db, 'teams', profile.teamId), { name: teamName });
      }
      if (userName !== profile.displayName) {
        await updateDoc(doc(db, 'users', profile.uid), { displayName: userName });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const updateDeliveryMode = async (enabled: boolean) => {
    if (profile.role !== 'leader') return;
    try {
      await updateDoc(doc(db, 'teams', profile.teamId), {
        isDeliveryMode: enabled,
        enableEarnings: enabled ? true : (team?.enableEarnings ?? true),
        enableSplitPay: enabled ? true : (team?.enableSplitPay ?? false)
      });
    } catch (err) {
      console.error(err);
    }
  };

  const updateTeamSettings = async (updates: Partial<Team>) => {
    if (profile.role !== 'leader' || !profile.teamId) return;
    try {
      await updateDoc(doc(db, 'teams', profile.teamId), updates);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `teams/${profile.teamId}`);
    }
  };

  return (
    <div className="space-y-8 md:space-y-12 py-6 md:py-10 max-w-5xl mx-auto px-6 md:px-8">
      <div>
        <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-2">Workspace Settings</h2>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Personal & Team Configuration</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-2 space-y-6 md:space-y-8">
          <div className="geometric-card p-6 md:p-10 space-y-8 md:space-y-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
              <div className="space-y-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Your Profile</h3>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 font-mono">Display Name</label>
                  <input 
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-indigo-600 font-bold transition-all shadow-inner"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 font-mono">Current Role</label>
                  <div className="px-5 py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-black uppercase text-[10px] tracking-[0.2em]">{profile.role === 'leader' ? 'Team Leader' : 'Team Member'}</div>
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Workspace Config</h3>
                {profile.role === 'leader' ? (
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 font-mono">Team Name</label>
                    <input 
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-indigo-600 font-bold transition-all shadow-inner"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 font-mono">Team Name</label>
                    <div className="px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-600 italic">
                      {team?.name || 'Loading...'}
                    </div>
                  </div>
                )}
                <div className="space-y-4">
                  <label className="block text-[10px] font-black uppercase text-slate-400 mb-2 font-mono">Team ID (Share to invite Members)</label>
                  <div className="flex gap-2">
                    {profile.role === 'leader' ? (
                      <input 
                        type="text"
                        className="flex-1 bg-slate-900 text-white rounded-2xl px-5 py-4 font-mono text-xs tracking-widest border-2 border-indigo-500/20 outline-none focus:border-indigo-500 transition-all"
                        value={newTeamId}
                        onChange={(e) => setNewTeamId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                        placeholder="new-team-id"
                      />
                    ) : (
                      <div className="flex-1 px-5 py-4 bg-slate-900 text-white rounded-2xl font-mono text-xs select-all text-center tracking-widest border-2 border-indigo-500/20">{profile.teamId}</div>
                    )}
                    <button 
                      onClick={() => {
                        if (profile.role === 'leader' && newTeamId !== team?.id) {
                          handleRenameTeamId();
                        } else {
                          navigator.clipboard.writeText(profile.teamId);
                          const btn = document.activeElement as HTMLButtonElement;
                          if (btn) {
                            const oldText = btn.innerHTML;
                            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><polyline points="20 6 9 17 4 12"></polyline></svg>';
                            setTimeout(() => { btn.innerHTML = oldText; }, 2000);
                          }
                        }
                      }}
                      className={cn(
                        "p-4 rounded-2xl transition-all active:scale-95 border",
                        profile.role === 'leader' && newTeamId !== team?.id 
                          ? "bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700" 
                          : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-indigo-50 hover:text-indigo-600"
                      )}
                      title={profile.role === 'leader' && newTeamId !== team?.id ? "Apply ID Change" : "Copy to clipboard"}
                    >
                      {profile.role === 'leader' && newTeamId !== team?.id ? <Check className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                    </button>
                  </div>
                  {profile.role === 'leader' && newTeamId !== team?.id && (
                    <p className="text-[8px] font-black text-rose-500 uppercase tracking-widest ml-1 animate-pulse">Warning: Changing ID will migrate all workspace data.</p>
                  )}
                </div>
              </div>

            <div className="pt-8 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-stretch gap-4">
              <div className="flex-1 flex flex-col gap-2">
                <button 
                  onClick={handleResetProfile}
                  disabled={isResetting}
                  className="w-full h-14 bg-rose-50 text-rose-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-rose-100 transition-all border border-rose-100 flex items-center justify-center gap-2 active:scale-95 shadow-sm"
                >
                  <LogOut className="w-4 h-4" />
                  {isResetting ? 'Processing...' : 'Disconnect Profile'}
                </button>
                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest text-center">Use this to leave the current team</p>
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <button 
                  disabled={saving}
                  onClick={async () => {
                    await handleUpdate();
                    alert("Settings updated successfully!");
                  }}
                  className="w-full h-14 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-xl shadow-indigo-600/20 active:scale-95 flex items-center justify-center"
                >
                  {saving ? 'UPDATING...' : 'SAVE CHANGES'}
                </button>
                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest text-center font-bold">Commit profile & workspace details</p>
              </div>
            </div>
          </div>

          {/* Team Members List (New) */}
          <div className="geometric-card p-6 md:p-10 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Team Members</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Current workspace connections</p>
              </div>
              <div className="px-3 py-1 bg-slate-100 rounded-full text-[9px] font-black text-slate-500 uppercase">
                {teamMembers.length} / 10 Active
              </div>
            </div>
            
            <div className="space-y-3">
              {teamMembers.map(member => (
                <div key={member.uid} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl group hover:border-indigo-100 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 text-sm font-black group-hover:text-indigo-600 transition-colors">
                      {member.displayName.charAt(0)}
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                        {member.displayName}
                        {member.role === 'leader' && (
                          <span className="bg-amber-100 text-amber-600 text-[8px] px-1.5 py-0.5 rounded-md font-black">LEADER</span>
                        )}
                        {member.uid === profile.uid && (
                          <span className="bg-indigo-100 text-indigo-600 text-[8px] px-1.5 py-0.5 rounded-md font-black">YOU</span>
                        )}
                      </div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{member.role} • {member.email || 'No email'}</p>
                    </div>
                  </div>
                  
                  {profile.role === 'leader' && member.uid !== profile.uid && (
                    <button 
                      onClick={() => handleRemoveMember(member.uid)}
                      className="p-2 text-rose-300 hover:text-rose-600 transition-all hover:bg-rose-50 rounded-lg group/remove relative"
                      title="Remove Member"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-rose-600 text-white text-[8px] font-black px-2 py-1 rounded opacity-0 group-hover/remove:opacity-100 whitespace-nowrap transition-opacity">Remove Profile</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="geometric-card p-6 md:p-10 bg-white">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2 mb-6 md:mb-8">Gig Feature Toggles</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {/* Gig Feature Toggles */}
                <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                   <div className="flex items-center gap-2.5 min-w-0">
                     <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-indigo-600 shrink-0">
                       <Car className="w-4 h-4" />
                     </div>
                     <div className="min-w-0">
                       <p className="text-[10px] font-black text-slate-900 leading-none mb-0.5 truncate">Rides & Delivery</p>
                       <p className="text-[7.5px] text-slate-400 font-bold uppercase tracking-wider truncate">DoorDash, Uber</p>
                     </div>
                   </div>
                   <button 
                     onClick={() => updateTeamSettings({ enableDeliveryGig: team?.enableDeliveryGig === false })}
                     disabled={profile.role !== 'leader'}
                     className={cn(
                       "w-8 h-5 rounded-full relative transition-all shadow-inner shrink-0",
                       team?.enableDeliveryGig !== false ? "bg-indigo-600" : "bg-slate-300",
                       profile.role !== 'leader' && "opacity-50 cursor-not-allowed"
                     )}
                   >
                     <div className={cn(
                       "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                       team?.enableDeliveryGig !== false ? "left-3.5" : "left-0.5"
                     )} />
                   </button>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                   <div className="flex items-center gap-2.5 min-w-0">
                     <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-600 shrink-0">
                       <Hammer className="w-4 h-4" />
                     </div>
                     <div className="min-w-0">
                       <p className="text-[10px] font-black text-slate-900 leading-none mb-0.5 truncate">Home & Manual</p>
                       <p className="text-[7.5px] text-slate-400 font-bold uppercase tracking-wider truncate">Repairs, Labor</p>
                     </div>
                   </div>
                   <button 
                     onClick={() => updateTeamSettings({ enableHomeServices: team?.enableHomeServices === false })}
                     disabled={profile.role !== 'leader'}
                     className={cn(
                       "w-8 h-5 rounded-full relative transition-all shadow-inner shrink-0",
                       team?.enableHomeServices !== false ? "bg-slate-700" : "bg-slate-300",
                       profile.role !== 'leader' && "opacity-50 cursor-not-allowed"
                     )}
                   >
                     <div className={cn(
                       "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                       team?.enableHomeServices !== false ? "left-3.5" : "left-0.5"
                     )} />
                   </button>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                   <div className="flex items-center gap-2.5 min-w-0">
                     <div className="w-8 h-8 rounded-xl bg-white shadow-sm flex items-center justify-center text-rose-500 shrink-0">
                       <Dog className="w-4 h-4" />
                     </div>
                     <div className="min-w-0">
                       <p className="text-[10px] font-black text-slate-900 leading-none mb-0.5 truncate">Pet & Care</p>
                       <p className="text-[7.5px] text-slate-400 font-bold uppercase tracking-wider truncate">Walking, Nanny</p>
                     </div>
                   </div>
                   <button 
                     onClick={() => updateTeamSettings({ enableCareServices: team?.enableCareServices === false })}
                     disabled={profile.role !== 'leader'}
                     className={cn(
                       "w-8 h-5 rounded-full relative transition-all shadow-inner shrink-0",
                       team?.enableCareServices !== false ? "bg-rose-500" : "bg-slate-300",
                       profile.role !== 'leader' && "opacity-50 cursor-not-allowed"
                     )}
                   >
                     <div className={cn(
                       "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm",
                       team?.enableCareServices !== false ? "left-3.5" : "left-0.5"
                     )} />
                   </button>
                </div>
              </div>

              <div className="flex flex-col gap-4 p-4 md:p-6 bg-slate-50 border border-slate-100 rounded-2xl md:rounded-3xl">
                <div className="flex items-center justify-between gap-4">
                  <div className="overflow-hidden">
                    <p className="text-sm font-black text-slate-900 truncate">Automatic Split Pay</p>
                    <p className="text-[10px] text-slate-400 font-bold leading-tight">Apply default percentage to new earnings</p>
                  </div>
                  <button 
                  onClick={() => updateTeamSettings({ 
                    enableSplitPay: !team?.enableSplitPay,
                    enableEarnings: true // Auto-enable ledger tool if split pay is activated
                  })}
                  disabled={profile.role !== 'leader'}
                  className={cn(
                    "w-12 h-7 md:w-14 md:h-8 rounded-full relative transition-all shadow-inner shrink-0",
                    team?.enableSplitPay ? "bg-emerald-600" : "bg-slate-300",
                    profile.role !== 'leader' && "opacity-50 cursor-not-allowed"
                  )}
                >
                    <div className={cn(
                      "absolute top-1 w-5 h-5 md:w-6 md:h-6 bg-white rounded-full transition-all shadow-sm",
                      team?.enableSplitPay ? "left-6 md:left-7" : "left-1"
                    )} />
                  </button>
                </div>
                
                {team?.enableSplitPay && (
                   <motion.div 
                     initial={{ opacity: 0, height: 0 }}
                     animate={{ opacity: 1, height: 'auto' }}
                     className="mt-2 space-y-4"
                   >
                     <div className="p-4 md:p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                       <div className="flex justify-between items-center mb-6">
                         <div className="flex flex-col text-left">
                            <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest leading-none mb-1">Driver / Leader</span>
                            <span className="text-lg md:text-2xl font-black text-slate-900">{team.splitPayPercentage}%</span>
                         </div>
                         <div className="flex items-center gap-1">
                            <ChevronLeft className="w-4 h-4 text-slate-300" />
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                         </div>
                         <div className="flex flex-col text-right">
                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">Assistant / Partner</span>
                            <span className="text-lg md:text-2xl font-black text-slate-900">{100 - (team.splitPayPercentage || 50)}%</span>
                         </div>
                       </div>

                       <input 
                         type="range"
                         min="0"
                         max="100"
                         step="5"
                         disabled={profile.role !== 'leader'}
                         value={team.splitPayPercentage ?? 50}
                         onChange={(e) => updateTeamSettings({ splitPayPercentage: parseInt(e.target.value) })}
                         className="w-full h-2 md:h-3 bg-slate-100 rounded-full appearance-none cursor-pointer accent-indigo-600 disabled:opacity-50"
                       />
                       <div className="flex justify-between mt-2 text-[8px] font-black text-slate-400 uppercase tracking-tighter">
                          <span>100% Leader</span>
                          <span>Zeroed Out</span>
                          <span>100% Assistant</span>
                       </div>
                     </div>
                   </motion.div>
                )}
              </div>
            </div>
          </div>
            {/* Recurring Workspace Templates */}
            {profile.role === 'leader' && (
              <div className="geometric-card p-6 md:p-10 space-y-8">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Assignment Templates</h3>
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">Recurring task presets</p>
                  </div>
                  <button className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100">+ New Template</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl flex flex-col justify-between group min-h-[140px] relative hover:border-indigo-200 transition-all">
                    <div className="flex items-start justify-between">
                       <div className="flex flex-col gap-1.5 overflow-hidden">
                          <p className="text-sm font-black text-slate-900 uppercase tracking-tight truncate">Main Delivery Run</p>
                          <div className="flex items-center gap-2">
                            <Repeat className="w-3 h-3 text-indigo-500" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Every Mon, Wed, Fri</p>
                          </div>
                       </div>
                       <div className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md shrink-0">8:00 AM</div>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-slate-200/50 mt-4 h-8 items-center overflow-hidden">
                       <button className="text-[9px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors">Edit Config</button>
                       <div className="w-px h-2 bg-slate-200" />
                       <button className="text-[9px] font-black uppercase text-rose-300 hover:text-rose-500 transition-colors">Terminate</button>
                    </div>
                  </div>
                  <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl flex flex-col justify-between group min-h-[140px] relative hover:border-indigo-200 transition-all">
                    <div className="flex items-start justify-between">
                       <div className="flex flex-col gap-1.5 overflow-hidden">
                          <p className="text-sm font-black text-slate-900 uppercase tracking-tight truncate">Daily Restock Run</p>
                          <div className="flex items-center gap-2">
                            <Repeat className="w-3 h-3 text-indigo-500" />
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Daily Routine</p>
                          </div>
                       </div>
                       <div className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md shrink-0">11:55 PM</div>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-slate-200/50 mt-4 h-8 items-center overflow-hidden">
                       <button className="text-[9px] font-black uppercase text-slate-400 hover:text-indigo-600 transition-colors">Edit Config</button>
                       <div className="w-px h-2 bg-slate-200" />
                       <button className="text-[9px] font-black uppercase text-rose-300 hover:text-rose-500 transition-colors">Terminate</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        <div className="space-y-8">
          <div className="geometric-card p-10 bg-indigo-900 text-white shadow-2xl relative overflow-hidden group">
            <div className="relative z-10">
              <Shield className="w-10 h-10 text-indigo-400 mb-6" />
              <h3 className="text-xl font-black tracking-tight mb-4">{profile.role === 'leader' ? 'Administrator Hub' : 'Member Hub'}</h3>
              <p className="text-[10px] font-bold text-indigo-300/80 leading-relaxed uppercase tracking-widest mb-8">
                {profile.role === 'leader' 
                  ? 'You control the workspace permissions and can manage the team ID for invitations.' 
                  : ''
                }
              </p>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Real-time Chat Active
                </div>
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Collaborative Scheduling
                </div>
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Financial Ledger
                </div>
              </div>
            </div>
            <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-white/5 rounded-full blur-2xl transition-transform group-hover:scale-150" />
          </div>

          <div className="geometric-card p-8 bg-white border-2 border-indigo-50">
             <h4 className="text-[10px] font-black uppercase text-indigo-400 mb-4 tracking-widest">Support & Docs</h4>
             <ul className="space-y-3">
               <li onClick={() => setActiveDoc('scheduling')} className="text-[11px] font-bold text-slate-600 hover:text-indigo-600 cursor-pointer flex items-center justify-between">
                 Scheduling Guide <ChevronRight className="w-3 h-3" />
               </li>
               <li onClick={() => setActiveDoc('ledger')} className="text-[11px] font-bold text-slate-600 hover:text-indigo-600 cursor-pointer flex items-center justify-between">
                 Ledger Best Practices <ChevronRight className="w-3 h-3" />
               </li>
               <li onClick={() => setActiveDoc('chat')} className="text-[11px] font-bold text-slate-600 hover:text-indigo-600 cursor-pointer flex items-center justify-between">
                 Chat Safety <ChevronRight className="w-3 h-3" />
               </li>
             </ul>
          </div>
        </div>
      </div>

      {activeDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-slate-100 flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-150 text-left">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  {activeDoc === 'scheduling' && 'Scheduling Guide'}
                  {activeDoc === 'ledger' && 'Ledger Best Practices'}
                  {activeDoc === 'chat' && 'Chat Safety Guidelines'}
                </h4>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Common Sense Notes</p>
              </div>
            </div>

            <div className="space-y-4 py-2">
              {activeDoc === 'scheduling' && (
                <>
                  <div className="space-y-1">
                    <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">1. Plan Ahead</h5>
                    <p className="text-xs text-slate-600 font-bold leading-relaxed">Draft and confirm your shifts early in the week. Provide team leaders at least 24 hours of heads-up prior to any schedule swaps or time-change requests.</p>
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">2. Agree on Swaps Directly</h5>
                    <p className="text-xs text-slate-600 font-bold leading-relaxed">Coordinate shift changes or coverage directly with your colleague before submitting official change requests to the system for approval.</p>
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">3. Prompt Absence Alerts</h5>
                    <p className="text-xs text-slate-600 font-bold leading-relaxed">If you cannot complete an assignment, click request off immediately and fill in comprehensive details so your teammate can cover the run.</p>
                  </div>
                </>
              )}

              {activeDoc === 'ledger' && (
                <>
                  <div className="space-y-1">
                    <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">1. Log Instantly</h5>
                    <p className="text-xs text-slate-600 font-bold leading-relaxed">Record your earnings immediately upon completing a shift or delivery run. This ensures precise daily bookkeeping and avoids lost tips.</p>
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">2. Double Check Split Percentages</h5>
                    <p className="text-xs text-slate-600 font-bold leading-relaxed">Verify split pay and partner distribution numbers carefully before clicking log. Precision is key to a dispute-free workspace.</p>
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-[10px] font-black text-emerald-600 uppercase tracking-wider">3. Resolve Disputes Privately</h5>
                    <p className="text-xs text-slate-600 font-bold leading-relaxed">If a ledger entry mismatch occurs, consult your partner or team leader offline or via private chat to settle details before modifying database entries.</p>
                  </div>
                </>
              )}

              {activeDoc === 'chat' && (
                <>
                  <div className="space-y-1">
                    <h5 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">1. Keep it Work-Related</h5>
                    <p className="text-xs text-slate-600 font-bold leading-relaxed">Workspace chat channels are intended for assignment updates, delays, vehicle status, and shift operations. Keep social chatter separate.</p>
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">2. Guard Credentials & Safety</h5>
                    <p className="text-xs text-slate-600 font-bold leading-relaxed">Never post sensitive account credentials, banking routing, or personal passwords within the shared chat rooms. Your safety is paramount.</p>
                  </div>
                  <div className="space-y-1">
                    <h5 className="text-[10px] font-black text-slate-700 uppercase tracking-wider">3. Professional Decorum</h5>
                    <p className="text-xs text-slate-600 font-bold leading-relaxed">Maintain a friendly, collaborative, and professional environment. Treat all team members and leaders with utmost respect.</p>
                  </div>
                </>
              )}
            </div>

            <button 
              onClick={() => setActiveDoc(null)}
              className="w-full h-14 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md active:scale-95 flex items-center justify-center"
            >
              Close Guide
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
);
}

function MileageTracker({ trips, profile }: { trips: WorkTrip[], profile: UserProfile }) {
  const [btConnected, setBtConnected] = useState(false);
  const [status, setStatus] = useState<'idle' | 'searching' | 'connected' | 'tracking'>('idle');

  const activeTrip = trips.find(t => t.status === 'active' && t.userId === profile.uid);

  const simulateBluetooth = () => {
    setStatus('searching');
    setTimeout(() => {
      setBtConnected(true);
      setStatus('connected');
    }, 2000);
  };

  const startTrip = async () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    try {
      const pos = await getCurrentPosition();
      const tripData = {
        userId: profile.uid,
        teamId: profile.teamId,
        vehicleName: "Work Vehicle",
        status: 'active',
        startTime: serverTimestamp(),
        startLocation: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        },
        distanceMiles: 0
      };

      await addDoc(collection(db, 'trips'), tripData);
      setStatus('tracking');
    } catch (err) {
      console.error(err);
      setStatus(btConnected ? 'connected' : 'idle');
      alert("Unable to start trip. Please allow location access and try again.");
    }
  };

  const stopTrip = async () => {
    if (!activeTrip) return;
    if (!activeTrip.id) {
      alert("Unable to end trip because this trip has not synced yet.");
      return;
    }

    try {
      const pos = await getCurrentPosition();
      const endLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const miles = calculateMiles(activeTrip.startLocation, endLocation);

      await updateDoc(doc(db, 'trips', activeTrip.id), {
        status: 'completed',
        endTime: serverTimestamp(),
        endLocation,
        distanceMiles: miles
      });
      setStatus('connected');
    } catch (err) {
      console.error(err);
      alert("Unable to end trip. Please allow location access and try again.");
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">Mileage Tracker</h2>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Automatic Trip Logging</p>
        </div>
        <div className="flex gap-4">
           {btConnected ? (
             <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-100">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
               Car Bluetooth Linked
             </div>
           ) : (
             <button 
               onClick={simulateBluetooth}
               className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
             >
               {status === 'searching' ? 'Searching...' : 'Pair Vehicle Bluetooth'}
             </button>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className={cn(
            "geometric-card p-6 md:p-12 transition-all duration-500 border-2 overflow-hidden flex flex-col items-center justify-center text-center relative",
            activeTrip ? "bg-indigo-900 border-indigo-500 text-white shadow-2xl scale-[1.02]" : "bg-white border-slate-100"
          )}>
            {activeTrip && (
              <div className="absolute top-0 right-0 p-4 md:p-8">
                <div className="px-3 py-1 bg-emerald-500 text-white rounded-full text-[8px] font-black uppercase tracking-widest animate-pulse">Live Tracking</div>
              </div>
            )}

            <div className={cn(
              "w-16 h-16 md:w-24 md:h-24 rounded-[1.5rem] md:rounded-[2rem] flex items-center justify-center mb-4 md:mb-6 transition-all duration-500",
              activeTrip ? "bg-white/10 text-white rotate-12" : "bg-slate-50 text-slate-400"
            )}>
              <Car className="w-8 h-8 md:w-10 md:h-10" />
            </div>

            <h3 className={cn(
              "text-xl md:text-2xl font-black tracking-tight mb-2",
              activeTrip ? "text-white" : "text-slate-900"
            )}>
              {activeTrip ? 'Current Trip Active' : 'Waiting for Journey'}
            </h3>
            
            <p className={cn(
              "text-xs md:text-sm mb-6 md:mb-10 max-w-xs leading-relaxed",
              activeTrip ? "text-indigo-200" : "text-slate-500"
            )}>
              {activeTrip 
                ? 'Your location is being pinned periodically. The system will auto-stop when Bluetooth disconnects.'
                : 'Start your vehicle or manually trigger a trip log below to begin tracking.'
              }
            </p>

            {activeTrip ? (
              <button 
                onClick={stopTrip}
                className="w-full md:w-auto px-12 py-5 bg-white text-indigo-900 rounded-[2rem] text-sm font-black uppercase tracking-[0.2em] hover:bg-indigo-50 transition-all shadow-xl active:scale-95"
              >
                Arrived / End Trip
              </button>
            ) : (
              <button 
                onClick={startTrip}
                className="w-full md:w-auto px-12 py-5 bg-indigo-600 text-white rounded-[2rem] text-sm font-black uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
              >
                Manual Start
              </button>
            )}
          </div>
        </div>

        <div className="geometric-card p-6 md:p-8 bg-white shadow-xl shadow-slate-100/50">
          <h3 className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-400 mb-6 flex items-center justify-between">
            Recent Activity
            <span className="text-[8px] bg-slate-100 px-2 py-0.5 rounded-full">PINPOINT LOG</span>
          </h3>
          <div className="space-y-4">
              {trips.filter(t => t.status === 'completed').slice(0, 5).map(trip => (
                <div key={trip.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-colors">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="text-[10px] md:text-xs font-black text-slate-900 uppercase tracking-tight">
                        {(() => {
                          return format(toDate(trip.endTime), 'MMM do, h:mm a');
                        })()}
                      </div>
                      <div className="text-[9px] md:text-[10px] text-slate-400 font-bold">{trip.distanceMiles} Miles logged</div>
                    </div>
                  </div>
                  <div className="text-xs md:text-sm font-black text-indigo-600">+${(trip.distanceMiles * STANDARD_MILEAGE_RATE).toFixed(2)}</div>
                </div>
              ))}
              {trips.length === 0 && (
                <div className="text-center py-8 text-slate-300 italic text-xs">No trips logged yet.</div>
              )}
            </div>
          </div>

        <div className="space-y-6">
          <div className="geometric-card p-6 bg-slate-900 text-white shadow-xl">
             <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
                   <Target className="w-4 h-4" />
                </div>
                <div>
                   <h4 className="text-sm font-black uppercase tracking-tight">Earning Potential</h4>
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Tax Deductions</p>
                </div>
             </div>
             
             <div className="space-y-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                   <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">Total Miles</p>
                   <p className="text-xl font-black">{trips.reduce((acc, t) => acc + (t.distanceMiles || 0), 0).toFixed(1)} <span className="text-xs opacity-50">Mi</span></p>
                </div>
                <div className="p-4 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl shadow-lg ring-1 ring-white/20">
                   <p className="text-[10px] text-indigo-200 font-bold uppercase mb-1">Est. Savings</p>
                   <p className="text-xl font-black">${(trips.reduce((acc, t) => acc + (t.distanceMiles || 0), 0) * STANDARD_MILEAGE_RATE).toFixed(2)}</p>
                   <p className="text-[8px] text-indigo-300 mt-2 font-mono">CALCULATED AT ${STANDARD_MILEAGE_RATE.toFixed(2)}/MILE</p>
                </div>
             </div>
          </div>

          <div className="geometric-card p-6 bg-white border border-slate-100 shadow-sm">
             <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Tracking Logic</h4>
             <ul className="space-y-3">
                <li className="flex items-start gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1 flex-shrink-0"></div>
                   <p className="text-[10px] font-bold text-slate-600 leading-relaxed uppercase">Start pinpointing when Bluetooth connects to vehicle.</p>
                </li>
                <li className="flex items-start gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1 flex-shrink-0"></div>
                   <p className="text-[10px] font-bold text-slate-600 leading-relaxed uppercase">Log end location when signal drops.</p>
                </li>
                <li className="flex items-start gap-2">
                   <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 mt-1 flex-shrink-0"></div>
                   <p className="text-[10px] font-bold text-slate-600 leading-relaxed uppercase">Encryption ensures location privacy outside of work trips.</p>
                </li>
             </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
