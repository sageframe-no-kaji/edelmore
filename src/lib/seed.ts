import type { Database } from 'better-sqlite3';
import { countUsers } from './db.js';

export function seedIfEmpty(db: Database): boolean {
  return countUsers(db) === 0;
}
