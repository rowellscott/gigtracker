import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));

// Offline support, same as the legacy app's init(). Registered relative to
// <base href>, so the preview build's SW scopes to /gigtracker/preview/ and
// the live app at the domain root is untouched.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
