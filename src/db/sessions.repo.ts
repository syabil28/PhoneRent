import { getDb } from './database';
import { bumpDataVersion } from './dataVersion';
import { getUnit, setUnitStatus } from './units.repo';
import { elapsedMinutes, swapDeviceMinutes } from '../utils/billing';
import type { Extension, InputMode, RentalSession, SessionStatus } from '../types/models';

interface SessionRow {
  id: number;
  unit_id: number;
  customer_name: string;
  notes: string | null;
  input_mode: string;
  planned_minutes: number | null;
  planned_amount: number | null;
  rate_snapshot: number;
  start_time: number;
  current_period_start: number | null;
  accumulated_minutes: number;
  end_time: number | null;
  total_cost: number | null;
  status: string;
}

function mapRow(row: SessionRow): RentalSession {
  return {
    id: row.id,
    unitId: row.unit_id,
    customerName: row.customer_name,
    notes: row.notes,
    inputMode: row.input_mode as InputMode,
    plannedMinutes: row.planned_minutes,
    plannedAmount: row.planned_amount,
    rateSnapshot: row.rate_snapshot,
    startTime: row.start_time,
    currentPeriodStart: row.current_period_start,
    accumulatedMinutes: row.accumulated_minutes,
    endTime: row.end_time,
    totalCost: row.total_cost,
    status: row.status as SessionStatus,
  };
}

export interface StartSessionInput {
  unitId: number;
  customerName: string;
  notes: string | null;
  inputMode: InputMode;
  plannedMinutes: number | null;
  plannedAmount: number | null;
  rateSnapshot: number;
}

export async function startSession(input: StartSessionInput): Promise<number> {
  const occupied = await getOccupyingSessionForUnit(input.unitId);
  if (occupied) {
    throw new Error(
      occupied.status === 'booked' ? 'Unit ini sudah dibooking penyewa lain.' : 'Unit ini sedang disewa penyewa lain.'
    );
  }

  const db = await getDb();
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO rental_sessions
      (unit_id, customer_name, notes, input_mode, planned_minutes, planned_amount, rate_snapshot,
       start_time, current_period_start, accumulated_minutes, end_time, total_cost, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 'active')`,
    input.unitId,
    input.customerName,
    input.notes,
    input.inputMode,
    input.plannedMinutes,
    input.plannedAmount,
    input.rateSnapshot,
    now,
    now
  );
  await setUnitStatus(input.unitId, 'active');
  bumpDataVersion();
  return result.lastInsertRowId;
}

/**
 * Booking: bayar di muka, jam belum jalan sampai diaktifkan.
 * Boleh dilakukan di unit yang sedang disewa (antre setelah penyewa sekarang selesai),
 * jadi status unit tidak ikut berubah — unit baru terpakai saat booking diaktifkan.
 */
export async function bookUnit(input: StartSessionInput): Promise<number> {
  const existingBooking = await getBookedSessionForUnit(input.unitId);
  if (existingBooking) {
    throw new Error('Unit ini sudah punya booking yang menunggu.');
  }

  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO rental_sessions
      (unit_id, customer_name, notes, input_mode, planned_minutes, planned_amount, rate_snapshot,
       start_time, current_period_start, accumulated_minutes, end_time, total_cost, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL, 'booked')`,
    input.unitId,
    input.customerName,
    input.notes,
    input.inputMode,
    input.plannedMinutes,
    input.plannedAmount,
    input.rateSnapshot,
    Date.now()
  );
  bumpDataVersion();
  return result.lastInsertRowId;
}

export async function activateBooking(id: number): Promise<void> {
  const session = await getSession(id);
  if (!session || session.status !== 'booked') throw new Error('Booking tidak ditemukan.');

  const activeOnUnit = await getActiveSessionForUnit(session.unitId);
  if (activeOnUnit) {
    const unit = await getUnit(session.unitId);
    throw new Error(`${unit ? unit.name : 'Unit ini'} masih dipakai penyewa sebelumnya.`);
  }

  const db = await getDb();
  await db.runAsync(
    "UPDATE rental_sessions SET current_period_start = ?, status = 'active' WHERE id = ?",
    Date.now(),
    id
  );
  await setUnitStatus(session.unitId, 'active');
  bumpDataVersion();
}

export async function cancelBooking(id: number): Promise<void> {
  const session = await getSession(id);
  if (!session || session.status !== 'booked') throw new Error('Booking tidak ditemukan.');

  // Status unit tidak disentuh: booking tidak pernah menandai unit terpakai.
  const db = await getDb();
  await db.runAsync("UPDATE rental_sessions SET status = 'cancelled' WHERE id = ?", id);
  bumpDataVersion();
}

export async function getBookedSessionForUnit(unitId: number): Promise<RentalSession | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionRow>(
    "SELECT * FROM rental_sessions WHERE unit_id = ? AND status = 'booked'",
    unitId
  );
  return row ? mapRow(row) : null;
}

export async function listBookedSessions(): Promise<RentalSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionRow>(
    "SELECT * FROM rental_sessions WHERE status = 'booked' ORDER BY start_time DESC"
  );
  return rows.map(mapRow);
}

export async function getActiveSessionForUnit(unitId: number): Promise<RentalSession | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionRow>(
    "SELECT * FROM rental_sessions WHERE unit_id = ? AND status = 'active'",
    unitId
  );
  return row ? mapRow(row) : null;
}

/** Unit dianggap terpakai kalau sedang berjalan ATAU sudah dibooking (sudah dibayar). */
export async function getOccupyingSessionForUnit(unitId: number): Promise<RentalSession | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionRow>(
    "SELECT * FROM rental_sessions WHERE unit_id = ? AND status IN ('active', 'booked')",
    unitId
  );
  return row ? mapRow(row) : null;
}

export async function listActiveSessions(): Promise<RentalSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionRow>("SELECT * FROM rental_sessions WHERE status = 'active'");
  return rows.map(mapRow);
}

export async function listPausedSessions(): Promise<RentalSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionRow>(
    "SELECT * FROM rental_sessions WHERE status = 'paused' ORDER BY start_time DESC"
  );
  return rows.map(mapRow);
}

export async function getSession(id: number): Promise<RentalSession | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SessionRow>('SELECT * FROM rental_sessions WHERE id = ?', id);
  return row ? mapRow(row) : null;
}

export async function pauseSession(id: number): Promise<void> {
  const db = await getDb();
  const session = await getSession(id);
  if (!session || session.status !== 'active' || session.currentPeriodStart == null) return;

  const additional = elapsedMinutes(session.currentPeriodStart, Date.now());
  await db.runAsync(
    "UPDATE rental_sessions SET accumulated_minutes = ?, current_period_start = NULL, status = 'paused' WHERE id = ?",
    session.accumulatedMinutes + additional,
    id
  );
  await setUnitStatus(session.unitId, 'idle');
  bumpDataVersion();
}

export async function resumeSession(id: number): Promise<void> {
  const session = await getSession(id);
  if (!session) throw new Error('Sesi tidak ditemukan.');

  const occupied = await getOccupyingSessionForUnit(session.unitId);
  if (occupied && occupied.id !== id) {
    const unit = await getUnit(session.unitId);
    throw new Error(`${unit ? unit.name : 'Unit ini'} sedang dipakai penyewa lain, tidak bisa dilanjutkan sekarang.`);
  }

  const db = await getDb();
  await db.runAsync(
    "UPDATE rental_sessions SET current_period_start = ?, status = 'active' WHERE id = ?",
    Date.now(),
    id
  );
  await setUnitStatus(session.unitId, 'active');
  bumpDataVersion();
}

export async function completeSession(id: number, unitId: number): Promise<number> {
  const db = await getDb();
  const session = await getSession(id);
  if (!session) return 0;

  // Nominal sewa bersifat fix (disepakati di awal / lewat tambah durasi), bukan dihitung dari waktu aktual.
  let finalMinutes = session.accumulatedMinutes;
  if (session.status === 'active' && session.currentPeriodStart != null) {
    finalMinutes += elapsedMinutes(session.currentPeriodStart, Date.now());
  }
  const totalCost = session.plannedAmount ?? 0;

  await db.runAsync(
    "UPDATE rental_sessions SET accumulated_minutes = ?, current_period_start = NULL, end_time = ?, total_cost = ?, status = 'completed' WHERE id = ?",
    finalMinutes,
    Date.now(),
    totalCost,
    id
  );

  await setUnitStatus(unitId, 'idle');
  bumpDataVersion();
  return totalCost;
}

export async function swapDevice(id: number, newUnitId: number): Promise<number> {
  const session = await getSession(id);
  if (!session) throw new Error('Sesi tidak ditemukan.');
  if (newUnitId === session.unitId) throw new Error('Unit tujuan sama dengan unit saat ini.');

  const occupiedTarget = await getOccupyingSessionForUnit(newUnitId);
  if (occupiedTarget) {
    const unit = await getUnit(newUnitId);
    throw new Error(`${unit ? unit.name : 'Unit tujuan'} sedang dipakai penyewa lain.`);
  }

  const newUnit = await getUnit(newUnitId);
  if (!newUnit) throw new Error('Unit tujuan tidak ditemukan.');

  // Nominal (plannedAmount) is fixed and never changes on swap. Only how much time
  // the not-yet-spent nominal buys at the new device's rate.
  const newMinutes = swapDeviceMinutes(session, newUnit.hourlyRate, Date.now());

  const db = await getDb();
  await db.runAsync(
    'UPDATE rental_sessions SET unit_id = ?, rate_snapshot = ?, planned_minutes = ? WHERE id = ?',
    newUnitId,
    newUnit.hourlyRate,
    Math.round(newMinutes),
    id
  );

  if (session.status === 'active') {
    await setUnitStatus(session.unitId, 'idle');
    await setUnitStatus(newUnitId, 'active');
  }

  bumpDataVersion();
  return newMinutes;
}

export async function extendSession(id: number, addMinutes: number, addAmount: number): Promise<void> {
  const session = await getSession(id);
  if (!session) throw new Error('Sesi tidak ditemukan.');

  const db = await getDb();
  await db.runAsync(
    'UPDATE rental_sessions SET planned_minutes = planned_minutes + ?, planned_amount = planned_amount + ? WHERE id = ?',
    Math.round(addMinutes),
    Math.round(addAmount),
    id
  );
  // Dicatat terpisah supaya tambahan durasi punya tanggal & nominal sendiri di riwayat/keuangan.
  await db.runAsync(
    `INSERT INTO extensions (session_id, unit_id, customer_name, added_minutes, added_amount, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    session.unitId,
    session.customerName,
    Math.round(addMinutes),
    Math.round(addAmount),
    Date.now()
  );
  bumpDataVersion();
}

/**
 * Dibatasi supaya riwayat yang menumpuk selama berbulan bulan tidak ikut dimuat
 * seluruhnya ke memori tiap kali layar Riwayat dibuka.
 */
export async function listCompletedSessions(limit = 200): Promise<RentalSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionRow>(
    "SELECT * FROM rental_sessions WHERE status = 'completed' ORDER BY end_time DESC LIMIT ?",
    limit
  );
  return rows.map(mapRow);
}

export async function countCompletedSessions(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number }>(
    "SELECT COUNT(*) as total FROM rental_sessions WHERE status = 'completed'"
  );
  return row?.total ?? 0;
}

export async function deleteSession(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM extensions WHERE session_id = ?', id);
  await db.runAsync('DELETE FROM rental_sessions WHERE id = ?', id);
  bumpDataVersion();
}

export async function deleteAllCompletedSessions(): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    "DELETE FROM extensions WHERE session_id IN (SELECT id FROM rental_sessions WHERE status = 'completed')"
  );
  await db.runAsync("DELETE FROM rental_sessions WHERE status = 'completed'");
  bumpDataVersion();
}

// Uang masuk dihitung sejak dibayar di awal (booking atau mulai sewa), bukan hanya saat Selesai.
export async function listIncomeSessions(sinceStartTime: number): Promise<RentalSession[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<SessionRow>(
    "SELECT * FROM rental_sessions WHERE status IN ('booked', 'active', 'paused', 'completed') AND start_time >= ? ORDER BY start_time DESC",
    sinceStartTime
  );
  return rows.map(mapRow);
}

interface ExtensionRow {
  id: number;
  session_id: number;
  unit_id: number;
  customer_name: string;
  added_minutes: number;
  added_amount: number;
  created_at: number;
}

function mapExtension(row: ExtensionRow): Extension {
  return {
    id: row.id,
    sessionId: row.session_id,
    unitId: row.unit_id,
    customerName: row.customer_name,
    addedMinutes: row.added_minutes,
    addedAmount: row.added_amount,
    createdAt: row.created_at,
  };
}

export async function listExtensions(sinceCreatedAt?: number, limit = 200): Promise<Extension[]> {
  const db = await getDb();
  const rows =
    sinceCreatedAt == null
      ? await db.getAllAsync<ExtensionRow>('SELECT * FROM extensions ORDER BY created_at DESC LIMIT ?', limit)
      : await db.getAllAsync<ExtensionRow>(
          'SELECT * FROM extensions WHERE created_at >= ? ORDER BY created_at DESC',
          sinceCreatedAt
        );
  return rows.map(mapExtension);
}

/**
 * Total tambahan durasi per sesi. Dipakai keuangan untuk mengurangi nominal sesi,
 * karena tiap tambahan dihitung terpisah sesuai tanggalnya sendiri.
 */
export async function getExtensionTotalsBySession(): Promise<Record<number, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ session_id: number; total: number }>(
    'SELECT session_id, SUM(added_amount) as total FROM extensions GROUP BY session_id'
  );
  return Object.fromEntries(rows.map((r) => [r.session_id, r.total]));
}
