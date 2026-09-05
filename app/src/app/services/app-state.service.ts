import { Injectable, signal } from '@angular/core';

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

  /** Id of the record currently being edited in the Add form, or null for
   * a fresh entry. Set by the Log's Edit button, cleared on save/cancel. */
  readonly editId = signal<string | null>(null);

  goTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  /** Log -> Add: open the given record for editing. */
  startEdit(id: string): void {
    this.editId.set(id);
    this.activeTab.set('add');
  }

  /** Add -> done: drop edit mode (save or cancel both call this). */
  clearEdit(): void {
    this.editId.set(null);
  }
}
