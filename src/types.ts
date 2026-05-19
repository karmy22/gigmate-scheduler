export type Role = 'leader' | 'member';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  teamId: string;
  colorPreference?: string;
}

export interface Category {
  id: string;
  label: string;
  color: string;
}

export type SlotType = string;
export type SlotStatus = 'confirmed' | 'pending';

export interface ShiftSlot {
  id?: string;
  date: string; // ISO yyyy-mm-dd
  hour: number; // 0-23
  minute: number; // 0, 15, 30, 45
  endHour?: number;
  endMinute?: number;
  isAllDay?: boolean;
  type: SlotType;
  title: string; // Custom name for the shift (e.g. "Math 101", "Night Shift")
  color: string; // HEX color for the slot
  notes?: string;
  status: SlotStatus;
  userId: string;
  teamId: string;
  reminderEnabled?: boolean;
  inviteTeam?: boolean;
  estimatedCost?: number;
  updatedAt: any;
  requestType?: 'absence' | 'change' | null;
  requestNotes?: string | null;
  requestedHours?: {
    hour: number;
    minute: number;
    endHour: number;
    endMinute: number;
  } | null;
}

export type TransactionType = 'earning' | 'payment';
export type BudgetCategory = 'work' | 'pleasure' | 'leisure';

export interface EarningEntry {
  id?: string;
  date: string;
  amount: number;
  category: string; // Source/Platform name e.g. "DoorDash", "Rent", etc.
  budgetCategory?: BudgetCategory;
  type: TransactionType;
  // Gig specific fields
  splitPercentage?: number; 
  driverPay?: number;
  assistantPay?: number;
  teamId: string;
  userId: string;
  createdAt: any;
}

export interface Team {
  id: string;
  name: string;
  leaderId: string;
  enableSplitPay?: boolean;
  splitPayPercentage?: number;
  enableEarnings?: boolean;
  enableDeliveryGig?: boolean; // Ride sharing, food delivery, grocery, package
  enableHomeServices?: boolean; // Handyman, repairs, manual labor
  enableCareServices?: boolean; // Pet sitting, childcare, dog walking
  members: string[]; // List of user UIDs
  categories?: Category[];
  createdAt: any;
}

export interface ChatMessage {
  id?: string;
  text: string;
  senderId: string;
  senderName: string;
  teamId: string;
  createdAt: any;
}

export interface TripLocation {
  lat: number;
  lng: number;
}

export interface WorkTrip {
  id?: string;
  userId: string;
  teamId: string;
  vehicleName: string;
  status: 'active' | 'completed';
  startTime: any;
  startLocation: TripLocation;
  endTime?: any;
  endLocation?: TripLocation;
  distanceMiles: number;
}
