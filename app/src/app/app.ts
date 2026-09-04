import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { LogComponent } from './log/log.component';
import { SummaryComponent } from './summary/summary.component';

type Tab = 'log' | 'summary';

@Component({
  selector: 'app-root',
  imports: [LogComponent, SummaryComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly activeTab = signal<Tab>('log');

  protected selectTab(tab: Tab): void {
    this.activeTab.set(tab);
  }
}
