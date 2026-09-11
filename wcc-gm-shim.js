/**
 * Tampermonkey API stand-ins so webdev-command-center.user.js can run
 * as a normal page script on the public live demo.
 */
(function () {
  'use strict';

  const prefix = 'wcc-demo:';

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(prefix + key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(prefix + key, JSON.stringify(value));
    } catch {
      /* private mode / quota */
    }
  }

  window.GM_getValue = function GM_getValue(key, fallback) {
    return read(key, fallback);
  };

  window.GM_setValue = function GM_setValue(key, value) {
    write(key, value);
  };

  window.GM_registerMenuCommand = function GM_registerMenuCommand() {};

  window.GM_xmlhttpRequest = function GM_xmlhttpRequest(opts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeout || 15000);
    const headers = new Headers(opts.headers || {});

    fetch(opts.url, {
      method: opts.method || 'GET',
      headers,
      redirect: 'follow',
      signal: controller.signal
    }).then((response) => {
      clearTimeout(timer);
      const responseHeaders = [...response.headers.entries()]
        .map(([name, value]) => `${name}: ${value}`)
        .join('\n');
      opts.onload?.({
        status: response.status,
        finalUrl: response.url,
        responseHeaders,
        responseText: ''
      });
    }).catch((error) => {
      clearTimeout(timer);
      if (error?.name === 'AbortError') opts.ontimeout?.();
      else opts.onerror?.();
    });
  };
})();
