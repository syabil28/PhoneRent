import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const DEFAULT_UNITS: Array<{ name: string; category: string; hourlyRate: number }> = [
  { name: 'PS1', category: 'PS', hourlyRate: 5000 },
  { name: 'PS2', category: 'PS', hourlyRate: 5000 },
  { name: 'HP1', category: 'HP', hourlyRate: 3000 },
  { name: 'PC1', category: 'PC', hourlyRate: 4000 },
  { name: 'PC2', category: 'PC', hourlyRate: 4000 },
];

async function ensureColumn(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  ddl: string
): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((c) => c.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = initDb().catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

async function initDb(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync('phonerent.db');

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      hourly_rate INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rental_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unit_id INTEGER NOT NULL REFERENCES units(id),
      customer_name TEXT NOT NULL,
      notes TEXT,
      input_mode TEXT NOT NULL,
      planned_minutes INTEGER,
      planned_amount INTEGER,
      rate_snapshot INTEGER NOT NULL,
      start_time INTEGER NOT NULL,
      current_period_start INTEGER,
      accumulated_minutes REAL NOT NULL DEFAULT 0,
      end_time INTEGER,
      total_cost INTEGER,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS extensions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES rental_sessions(id),
      unit_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      added_minutes INTEGER NOT NULL,
      added_amount INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_status ON rental_sessions (status);
    CREATE INDEX IF NOT EXISTS idx_sessions_unit_status ON rental_sessions (unit_id, status);
    CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON rental_sessions (start_time);
    CREATE INDEX IF NOT EXISTS idx_extensions_session ON extensions (session_id);
    CREATE INDEX IF NOT EXISTS idx_extensions_created ON extensions (created_at);
  `);

  // Migration safety net for the pause/resume columns on pre-existing dev databases.
  await ensureColumn(db, 'rental_sessions', 'current_period_start', 'current_period_start INTEGER');
  await ensureColumn(
    db,
    'rental_sessions',
    'accumulated_minutes',
    'accumulated_minutes REAL NOT NULL DEFAULT 0'
  );

  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM units');
  if (!row || row.count === 0) {
    for (const unit of DEFAULT_UNITS) {
      await db.runAsync(
        'INSERT INTO units (name, category, hourly_rate, status, created_at) VALUES (?, ?, ?, ?, ?)',
        unit.name,
        unit.category,
        unit.hourlyRate,
        'idle',
        Date.now()
      );
    }
  }

  return db;
}
