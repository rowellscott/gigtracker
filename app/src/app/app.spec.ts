import 'fake-indexeddb/auto';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  let fixture: ComponentFixture<App>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();

    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const el = () => fixture.nativeElement as HTMLElement;

  it('creates the app', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('keeps the topbar title', () => {
    expect(el().textContent).toContain('GigTracker 2026');
  });

  it('shows the Log tab by default', () => {
    expect(el().querySelector('app-log')).not.toBeNull();
    expect(el().querySelector('app-summary')).toBeNull();

    const logTab = el().querySelector('[data-tab="log"]') as HTMLElement;
    expect(logTab.classList.contains('active')).toBe(true);
  });

  it('swaps to the Summary tab on click', async () => {
    const summaryTab = el().querySelector('[data-tab="summary"]') as HTMLButtonElement;
    summaryTab.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().querySelector('app-summary')).not.toBeNull();
    expect(el().querySelector('app-log')).toBeNull();
    expect(
      (el().querySelector('[data-tab="summary"]') as HTMLElement).classList.contains('active'),
    ).toBe(true);
  });
});
