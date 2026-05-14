import type { Database } from 'better-sqlite3';

declare global {
  namespace App {
    interface Locals {
      db: Database;
      user?: { id: number; username: string; cover_id: string };
    }
  }
}
