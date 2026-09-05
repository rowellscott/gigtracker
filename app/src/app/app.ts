import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AddComponent } from './add/add.component';
import { LogComponent } from './log/log.component';
import { SummaryComponent } from './summary/summary.component';
import { SettingsComponent } from './settings/settings.component';
import { AppStateService, Tab } from './services/app-state.service';
import { GigDbService } from './services/gig-db.service';

type BackupState = 'ok' | 'warn' | 'never';

@Component({
  selector: 'app-root',
  imports: [AddComponent, LogComponent, SummaryComponent, SettingsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private state = inject(AppStateService);
  private db = inject(GigDbService);

  protected readonly activeTab = this.state.activeTab;
  protected readonly editing = computed(() => this.state.editId() !== null);
  protected readonly backup = signal<BackupState>('never');
  protected readonly backupTitle = signal('No backup yet — export from Settings');

  constructor() {
    // Re-check the backup-reminder dot on every tab change, the same way the
    // legacy app calls updateBackupDot() after every render.
    effect(() => {
      this.activeTab();
      void this.refreshBackup();
    });
  }

  protected selectTab(tab: Tab): void {
    this.state.goTab(tab);
  }

  private async refreshBackup(): Promise<void> {
    const last = await this.db.kvGet<string>('lastBackupAt');
    if (!last) {
      this.backup.set('never');
      this.backupTitle.set('No backup yet — export from Settings');
      return;
    }
    const days = (Date.now() - new Date(last).getTime()) / 86400000;
    if (days > 14) {
      this.backup.set('warn');
      this.backupTitle.set(`Last backup ${Math.floor(days)} days ago — consider exporting`);
    } else {
      this.backup.set('ok');
      this.backupTitle.set(`Last backup: ${new Date(last).toLocaleDateString()}`);
    }
  }
}
