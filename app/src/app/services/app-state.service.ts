import { Injectable, computed, signal } from '@angular/core';
import { GigRecord } from './gig-db.service';

export type Tab = 'add' | 'log' | 'summary' | 'settings';

/**
 * The tiny bit of cross-tab UI state the legacy single-file app kept in
 * module-level `let` variables (`activeTab`, `editId`). In the Angular
 * rewrite the tabs are separate components mounted one at a time, so this
 * service is how "tap Edit on a Log card" reaches the Add form and how the
 * Add form sends you back to the Log afterwards -- same behaviour, just
 * routed through a shared signal instead of a shared global.
 */
@Injectable({ providedIn: 'root' })
export class AppStateService {
  /** Which tab is showing. Starts on Add, exactly like the legacy app. */
  readonly activeTab = signal<Tab>('add');

  /** The record currently open for editing in the Add form, or null for a
   * fresh entry. The Log passes the whole record (it already has it in
   * hand), so the Add form populates synchronously -- no re-fetch. */
  readonly editRecord = signal<GigRecord | null>(null);

  /** Id of the record being edited, or null. Convenience view of
   * `editRecord` for templates and callers that only need the id. */
  readonly editId = computed(() => this.editRecord()?.id ?? null);

  goTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  /** Log -> Add: open the given record for editing. */
  startEdit(record: GigRecord): void {
    this.editRecord.set(record);
    this.activeTab.set('add');
  }

  /** Add -> done: drop edit mode (save or cancel both call this). */
  clearEdit(): void {
    this.editRecord.set(null);
  }
}
