import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { AddComponent } from './add/add.component';
import { LogComponent } from './log/log.component';
import { SummaryComponent } from './summary/summary.component';
import { SettingsComponent } from './settings/settings.component';

type Tab = 'add' | 'log' | 'summary' | 'settings';

@Component({
  selector: 'app-root',
  imports: [AddComponent, LogComponent, SummaryComponent, SettingsComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly activeTab = signal<Tab>('add');

  protected selectTab(tab: Tab): void {
    this.activeTab.set(tab);
  }
}
