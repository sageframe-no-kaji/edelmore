// See https://svelte.dev/docs/kit/types#app.d.ts for information about these
// interfaces. The reader has no auth and no sessions — Locals carries only the
// household library's database handle and its on-disk data directory
// (wired per-request by hooks.server.ts).
import type { Database } from 'better-sqlite3';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      db: Database;
      /** Root of the on-disk library: books/<id>/{original.epub,book.json,images/}. */
      dataDir: string;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}
