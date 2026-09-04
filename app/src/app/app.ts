import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { GigDbService } from './services/gig-db.service';

/**
 * Step 1 of the rewrite (see the plan in chat): app shell only, no Add/Log/
 * Summary screens yet. This component's one job is to prove GigDbService
 * reads the real, already-installed 'GigTrackerDB' -- same records the
 * legacy index.html app has been writing -- not a fresh/empty database.
 */
@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly db = inject(GigDbService);

  protected readonly recordsResource = resource({
    loader: () => this.db.recsGetAll(),
  });

  protected readonly recordCount = computed(() => this.recordsResource.value()?.length ?? 0);
  protected readonly totalIncome = computed(() =>
    (this.recordsResource.value() ?? [])
      .filter((r) => r.type === 'income')
      .reduce((sum, r) => sum + (r.amount || 0) + (r.tips || 0), 0),
  );
}
