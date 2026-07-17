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
      /**
       * Household identity marker (hooks.server.ts sets it on every request).
       * The reader has no auth; the shared @edelmore/narration speak handlers
       * gate on `locals.user`, so under the household model network locality is
       * the identity and this constant satisfies the package's contract without
       * modifying the package. Optional in the type because the diary's richer
       * user shape and the reader's marker both flow through the same package.
       */
      user?: { id: number };
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}
