import { getDb } from './database';
import { bumpDataVersion } from './dataVersion';
import type { Unit, UnitCategory, UnitStatus } from '../types/models';

interface UnitRow {
  id: number;
  name: string;
  category: string;
  hourly_rate: number;
  status: string;
  created_at: number;
}

function mapRow(row: UnitRow): Unit {
  return {
    id: row.id,
    name: row.name,
    category: row.category as UnitCategory,
    hourlyRate: row.hourly_rate,
    status: row.status as UnitStatus,
    createdAt: row.created_at,
  };
}

export async function listUnits(): Promise<Unit[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<UnitRow>('SELECT * FROM units ORDER BY category, name');
  return rows.map(mapRow);
}

export async function getUnit(id: number): Promise<Unit | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<UnitRow>('SELECT * FROM units WHERE id = ?', id);
  return row ? mapRow(row) : null;
}

export async function setUnitStatus(id: number, status: UnitStatus): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE units SET status = ? WHERE id = ?', status, id);
  bumpDataVersion();
}

export interface UnitInput {
  name: string;
  category: UnitCategory;
  hourlyRate: number;
}

export async function addUnit(input: UnitInput): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO units (name, category, hourly_rate, status, created_at) VALUES (?, ?, ?, ?, ?)',
    input.name,
    input.category,
    input.hourlyRate,
    'idle',
    Date.now()
  );
  bumpDataVersion();
  return result.lastInsertRowId;
}

export async function updateUnit(id: number, input: UnitInput): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE units SET name = ?, category = ?, hourly_rate = ? WHERE id = ?',
    input.name,
    input.category,
    input.hourlyRate,
    id
  );
  bumpDataVersion();
}

export async function deleteUnit(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM units WHERE id = ?', id);
  bumpDataVersion();
}
