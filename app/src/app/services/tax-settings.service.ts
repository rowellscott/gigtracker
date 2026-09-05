import { Injectable, computed, inject, signal } from '@angular/core';
import { GigDbService, TaxSettings } from './gig-db.service';

const APP_SETTINGS_KEY = 'appSettings';

/** Sane defaults, matching the legacy app's saveCfg() fallbacks. A missing
 * or partial stored config is merged over these so `settings()` is always
 * a complete TaxSettings. */
const DEFAULTS: TaxSettings = {
  federalRate: 24,
  stateRate: 0,
  irsRate: 0.725,
  trueCostRate: 0.5,
  mpg: 28,
};

/**
 * Single source of truth for the user's tax settings. AddComponent,
 * LogComponent, SummaryComponent and SettingsComponent all read rates from
 * here instead of each loading `appSettings` from IndexedDB and re-deriving
 * the same values.
 */
@Injectable({ providedIn: 'root' })
export class TaxSettingsService {
  private readonly db = inject(GigDbService);

  private readonly _settings = signal<TaxSettings>(DEFAULTS);
  readonly settings = this._settings.asReadonly();

  readonly irsRate = computed(() => this._settings().irsRate);
  readonly trueCostRate = computed(() => this._settings().trueCostRate);
  readonly combinedRatePct = computed(
    () => Number(this._settings().federalRate) + Number(this._settings().stateRate),
  );

  private loadOnce: Promise<void> | null = null;

  /** Reads `appSettings` the first time it's called; later calls reuse that
   * result. Safe to call from every consuming component's ngOnInit. */
  ensureLoaded(): Promise<void> {
    if (!this.loadOnce) this.loadOnce = this.readIntoSignal();
    return this.loadOnce;
  }

  /** Re-read after an external change (e.g. a JSON restore in Settings). */
  reload(): Promise<void> {
    this.loadOnce = this.readIntoSignal();
    return this.loadOnce;
  }

  async save(cfg: TaxSettings): Promise<void> {
    await this.db.kvSet(APP_SETTINGS_KEY, cfg);
    this._settings.set(withDefaults(cfg));
    this.loadOnce = Promise.resolve();
  }

  private async readIntoSignal(): Promise<void> {
    this._settings.set(withDefaults(await this.readStored()));
  }

  private async readStored(): Promise<Partial<TaxSettings> | null> {
    try {
      if (typeof this.db.kvGet !== 'function') return null;
      return await this.db.kvGet<TaxSettings>(APP_SETTINGS_KEY);
    } catch {
      return null;
    }
  }
}

function withDefaults(stored: Partial<TaxSettings> | null | undefined): TaxSettings {
  const s = stored ?? {};
  return {
    federalRate: s.federalRate ?? DEFAULTS.federalRate,
    stateRate: s.stateRate ?? DEFAULTS.stateRate,
    irsRate: s.irsRate ?? DEFAULTS.irsRate,
    trueCostRate: s.trueCostRate ?? DEFAULTS.trueCostRate,
    mpg: s.mpg ?? DEFAULTS.mpg,
  };
}
