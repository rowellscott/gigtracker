import { Injectable } from '@angular/core';

/**
 * A gig/rehearsal/expense record, as stored in the 'recs' IndexedDB store.
 * Field set matches the legacy index.html app exactly (see saveRec() there)
 * -- this is not a redesigned schema, it reads the same on-device data.
 */
export interface GigRecord {
  id: string;
  date: string;
  payDate?: string;
  type: 'income' | 'rehearsal' | 'expense';
  desc: string;
  amount: number;
  payMethod?: string;
  notes?: string;
  start?: string;
  end?: string;
  hasToll?: boolean; tollCost?: number;
  hasMeal?: boolean; mealCost?: number;
  hasOther?: boolean; otherDesc?: string; otherCost?: number;
  hasRoom?: boolean; roomCost?: number;
  hasTips?: boolean; tipsAmount?: number; tipsInTax?: boolean;
  miles?: number; gasPrice?: number;
  // Calculated fields stored alongside the raw data (see TaxCalcService)
  hours?: number; fuelCost?: number; trueCostMiles?: number; irsDed?: number;
  dedMeals?: number; totalDed?: number; taxSavings?: number; trueCosts?: number;
  seTax?: number; incomeTax?: number; totalTax?: number; netAfterAll?: number;
  trueHourly?: number | null; grossHourly?: number | null;
  toll?: number; meal?: number; oth?: number; room?: number; tips?: number;
  deleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
  synced?: boolean;
}

export interface TaxSettings {
  federalRate: number;
  stateRate: number;
  irsRate: number;
  trueCostRate: number;
  mpg: number;
}

const DB_NAME = 'GigTrackerDB';
const DB_VERSION = 1;
const RECS_STORE = 'recs';
const KV_STORE = 'kv';

/**
 * Reads/writes the exact same on-device IndexedDB database the legacy
 * index.html app uses ('GigTrackerDB', stores 'recs' + 'kv', same keyPaths).
 * This is deliberate: the rewrite must never orphan a musician's existing
 * gig/tax history just because the UI layer changed.
 */
@Injectable({ providedIn: 'root' })
export class GigDbService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(RECS_STORE)) {
            db.createObjectStore(RECS_STORE, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(KV_STORE)) {
            db.createObjectStore(KV_STORE, { keyPath: 'k' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbPromise;
  }

  private async get<T>(store: string, key: string): Promise<T | undefined> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async put(store: string, value: unknown): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readwrite').objectStore(store).put(value);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private async getAll<T>(store: string): Promise<T[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async kvGet<T>(key: string): Promise<T | null> {
    const row = await this.get<{ k: string; v: T }>(KV_STORE, key);
    return row != null ? row.v : null;
  }

  async kvSet(key: string, value: unknown): Promise<void> {
    await this.put(KV_STORE, { k: key, v: value });
  }

  /**
   * Saved gig locations (venue/gig names the user reuses often), for
   * quick-select in the Add form. Stored under the existing 'kv' store
   * rather than a new object store, deliberately -- adding a real store
   * needs a DB_VERSION bump and an onupgradeneeded migration path for
   * every already-installed user; a kv entry needs neither.
   */
  private static readonly SAVED_LOCATIONS_KEY = 'savedGigLocations';

  async getSavedLocations(): Promise<string[]> {
    return (await this.kvGet<string[]>(GigDbService.SAVED_LOCATIONS_KEY)) ?? [];
  }

  async addSavedLocation(name: string): Promise<string[]> {
    const trimmed = name.trim();
    const current = await this.getSavedLocations();
    if (!trimmed || current.includes(trimmed)) return current;
    const updated = [...current, trimmed].sort((a, b) => a.localeCompare(b));
    await this.kvSet(GigDbService.SAVED_LOCATIONS_KEY, updated);
    return updated;
  }

  async removeSavedLocation(name: string): Promise<string[]> {
    const current = await this.getSavedLocations();
    const updated = current.filter((loc) => loc !== name);
    await this.kvSet(GigDbService.SAVED_LOCATIONS_KEY, updated);
    return updated;
  }

  /** All non-deleted records, newest date first -- matches recsGetAll() in the legacy app. */
  async recsGetAll(): Promise<GigRecord[]> {
    const all = await this.getAll<GigRecord>(RECS_STORE);
    return all
      .filter((r) => !r.deleted)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  async recGet(id: string): Promise<GigRecord | undefined> {
    return this.get<GigRecord>(RECS_STORE, id);
  }

  async recSave(rec: GigRecord): Promise<void> {
    rec.updatedAt = new Date().toISOString();
    await this.put(RECS_STORE, rec);
  }

  async recMarkDeleted(id: string): Promise<void> {
    const rec = await this.recGet(id);
    if (rec) {
      rec.deleted = true;
      rec.updatedAt = new Date().toISOString();
      await this.put(RECS_STORE, rec);
    }
  }
}
