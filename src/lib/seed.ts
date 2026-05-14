import type { Database } from 'better-sqlite3';
import { hashPin } from './auth.js';
import { countUsers, createUser } from './db.js';

export const DEFAULT_USERS = [
  { username: 'Iona', pin: process.env.IONA_PIN ?? '1111' },
  { username: 'Isla', pin: process.env.ISLA_PIN ?? '2222' },
];

export async function seedIfEmpty(
  db: Database,
  users: Array<{ username: string; pin: string }> = DEFAULT_USERS
): Promise<void> {
  if (countUsers(db) > 0) return;
  for (const { username, pin } of users) {
    const pinHash = await hashPin(pin);
    createUser(db, username, pinHash);
  }
}
