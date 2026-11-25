export type AccountRole = 'resident' | 'officer' | 'captain' | 'superuser';

export interface Barangay {
  id: string;
  name: string;
  city: string;
  province: string;
  latitude?: number;
  longitude?: number;
}

export interface Account {
  id: string;
  name: string;
  email: string;
  mobile: string;
  provider: 'google' | 'facebook' | 'mobile' | 'email';
  role: AccountRole;
  barangayId: string | null;
  address: string;
  photoUrl?: string;
  verified: boolean;
  createdAt: number;
  violationCount?: number;
  banned?: boolean;
  suspendedUntil?: number | null;
  marketplaceAlerts?: boolean;
  marketplaceRadiusKm?: number;
  notifications?: { incidents: boolean; announcements: boolean; messages: boolean; marketplace: boolean };
}
