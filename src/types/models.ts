export type UnitCategory = 'PS' | 'HP' | 'PC';
export type UnitStatus = 'idle' | 'active';
export type InputMode = 'duration' | 'nominal';
export type SessionStatus = 'booked' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface Unit {
  id: number;
  name: string;
  category: UnitCategory;
  hourlyRate: number;
  status: UnitStatus;
  createdAt: number;
}

export interface RentalSession {
  id: number;
  unitId: number;
  customerName: string;
  notes: string | null;
  inputMode: InputMode;
  plannedMinutes: number | null;
  plannedAmount: number | null;
  rateSnapshot: number;
  startTime: number;
  currentPeriodStart: number | null;
  accumulatedMinutes: number;
  endTime: number | null;
  totalCost: number | null;
  status: SessionStatus;
}

export interface Extension {
  id: number;
  sessionId: number;
  unitId: number;
  customerName: string;
  addedMinutes: number;
  addedAmount: number;
  createdAt: number;
}
