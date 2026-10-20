import { afterEach } from 'vitest';

// Each test starts with empty browser storage so persisted stores do not leak between tests.
afterEach(() => {
  try {
    globalThis.localStorage?.clear();
  } catch {
    /* node environment without storage */
  }
});

// jsdom does not implement layout APIs used for auto-scrolling.
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = function scrollTo() {};
}
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture() {};
}
