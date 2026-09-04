import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  let fixture: ComponentFixture<App>;

  beforeEach(async () => {
    // App mounts Log/Summary/Settings, and each reads GigDbService in its
    // own ngOnInit -- a real IndexedDB shim is required or those throw
    // ReferenceError: indexedDB is not defined (jsdom doesn't provide one).
    globalThis.indexedDB = new IDBFactory();
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const el = () => fixture.nativeElement as HTMLElement;

  function expectOnly(selector: string): void {
    for (const s of ['app-add', 'app-log', 'app-summary', 'app-settings']) {
      if (s === selector) {
        expect(el().querySelector(s)).toBeTruthy();
      } else {
        expect(el().querySelector(s)).toBeNull();
      }
    }
  }

  async function clickTab(tab: string): Promise<void> {
    const btn = el().querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`);
    expect(btn).toBeTruthy();
    btn!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('creates the app', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders four tabs in order', () => {
    const tabs = Array.from(el().querySelectorAll('.tabbar .tab')).map((b) =>
      b.getAttribute('data-tab'),
    );
    expect(tabs).toEqual(['add', 'log', 'summary', 'settings']);
  });

  it('defaults to the Add tab', () => {
    expectOnly('app-add');
    expect(el().querySelector('[data-tab="add"]')!.classList.contains('active')).toBe(true);
  });

  it('switches to Log', async () => {
    await clickTab('log');
    expectOnly('app-log');
    expect(el().querySelector('[data-tab="log"]')!.classList.contains('active')).toBe(true);
    expect(el().querySelector('[data-tab="add"]')!.classList.contains('active')).toBe(false);
  });

  it('switches to Summary', async () => {
    await clickTab('summary');
    expectOnly('app-summary');
    expect(el().querySelector('[data-tab="summary"]')!.classList.contains('active')).toBe(true);
  });

  it('switches to Settings', async () => {
    await clickTab('settings');
    expectOnly('app-settings');
    expect(el().querySelector('[data-tab="settings"]')!.classList.contains('active')).toBe(true);
  });
});
