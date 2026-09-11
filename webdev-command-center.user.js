// ==UserScript==
// @name         WebDev Command Center — Senior Audit Swiss Army Knife
// @namespace    https://jeremyredkey.github.io/webdev-command-center
// @version      0.5.0
// @description  Senior web developer audit toolkit: inspect, WCAG/ADA/California standards, links, responsive device lab, performance, semantics, security heuristics, capture, annotations, campaign intelligence, and design research.
// @author       Jeremy Redkey / Redkey Web Design
// @homepageURL  https://jeremyredkey.github.io/webdev-command-center/
// @downloadURL  https://jeremyredkey.github.io/webdev-command-center/webdev-command-center.user.js
// @updateURL    https://jeremyredkey.github.io/webdev-command-center/webdev-command-center.user.js
// @match        http://*/*
// @match        https://*/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @require      https://cdn.jsdelivr.net/npm/axe-core@4.13.0/axe.min.js
// ==/UserScript==

(function () {
  'use strict';

  // Do not inject the command center into its own responsive-lab frames.
  if (window.top !== window.self) return;

  const APP_ID = 'wcc-root';
  const HILITE_ID = 'wcc-highlight';
  const LAB_ID = 'wcc-responsive-lab';
  const STYLE_ID = 'wcc-style';
  const TEST_STYLE_ID = 'wcc-test-style';
  const STORAGE = {
    notes: 'wcc-notes-v3',
    panelOpen: 'wcc-panel-open',
    a11yProfile: 'wcc-a11y-profile',
    activeTab: 'wcc-active-tab',
    responsiveDevices: 'wcc-responsive-devices-v1'
  };

  const DEVICE_PRESETS = [
    { preset:'iphone', name:'iPhone', w:390, h:844 },
    { preset:'iphone-se', name:'iPhone SE', w:375, h:667 },
    { preset:'iphone-max', name:'iPhone Pro Max', w:430, h:932 },
    { preset:'pixel', name:'Pixel / Android', w:412, h:915 },
    { preset:'ipad', name:'iPad', w:768, h:1024 },
    { preset:'ipad-pro', name:'iPad Pro', w:1024, h:1366 },
    { preset:'laptop', name:'Laptop', w:1280, h:800 },
    { preset:'desktop', name:'Desktop', w:1440, h:900 },
    { preset:'wide', name:'Wide Desktop', w:1920, h:1080 }
  ];

  function defaultResponsiveDevices() {
    return ['iphone','ipad'].map(id => {
      const d = DEVICE_PRESETS.find(x => x.preset === id);
      return { ...d, id:`${id}-${Date.now()}-${Math.random().toString(36).slice(2,7)}` };
    });
  }

  function loadResponsiveDevices() {
    const saved = GM_getValue(STORAGE.responsiveDevices, null);
    if (!Array.isArray(saved)) return defaultResponsiveDevices();
    const valid = saved.filter(d => d && typeof d.name === 'string' && Number.isFinite(+d.w) && Number.isFinite(+d.h) && +d.w >= 240 && +d.h >= 320)
      .map(d => ({ ...d, w:Math.round(+d.w), h:Math.round(+d.h), id:d.id || `device-${Date.now()}-${Math.random().toString(36).slice(2,7)}` }));
    return valid.length ? valid : defaultResponsiveDevices();
  }


  const state = {
    inspectMode: false,
    annotateMode: false,
    outlineMode: false,
    editMode: false,
    selectedEl: null,
    notes: (GM_getValue(STORAGE.notes, {})[location.href] || []).map(n => ({ ...n, clip:n.clip || '', status:n.status || 'open' })),
    panelOpen: GM_getValue(STORAGE.panelOpen, true),
    a11yProfile: GM_getValue(STORAGE.a11yProfile, 'title2'),
    activeTab: GM_getValue(STORAGE.activeTab, 'inspect'),
    axeResults: null,
    customA11y: [],
    standardsResults: [],
    engineeringResults: [],
    linkResults: [],
    linkScanRunning: false,
    linkScanAbort: false,
    visualTest: null,
    responsiveSync: false,
    responsiveDevices: loadResponsiveDevices()
  };

  // Recover gracefully if a previously stored tab no longer exists in this build.
  if (!['inspect','audit','links','responsive','review','campaign'].includes(state.activeTab)) state.activeTab = 'inspect';

  const css = `
    #${APP_ID}, #${APP_ID} * { box-sizing: border-box; }
    #${APP_ID} {
      --wcc-bg:#0f141a; --wcc-panel:#171e27; --wcc-panel2:#202a35; --wcc-text:#f5f7fa;
      --wcc-muted:#a6b1be; --wcc-border:#344150; --wcc-accent:#69b7ff; --wcc-good:#5ddd93;
      --wcc-warn:#ffd06a; --wcc-bad:#ff7b7b; --wcc-info:#8fc8ff;
      position:fixed; right:16px; bottom:16px; width:min(470px,calc(100vw - 32px)); max-height:calc(100vh - 32px);
      z-index:2147483646; color:var(--wcc-text); font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      text-align:left; direction:ltr;
    }
    #${APP_ID} .wcc-shell { background:var(--wcc-bg); border:1px solid var(--wcc-border); border-radius:14px; box-shadow:0 18px 50px rgba(0,0,0,.4); overflow:hidden; }
    #${APP_ID} .wcc-head { display:flex; align-items:center; gap:8px; padding:9px 11px; background:linear-gradient(180deg,#1c2631,#141b23); border-bottom:1px solid var(--wcc-border); }
    #${APP_ID} .wcc-title { font-weight:750; flex:1; font-size:13px; }
    #${APP_ID} .wcc-version { color:var(--wcc-muted); font-size:10px; }
    #${APP_ID} button,#${APP_ID} input,#${APP_ID} textarea,#${APP_ID} select { font:inherit; }
    #${APP_ID} button { border:1px solid var(--wcc-border); background:var(--wcc-panel2); color:var(--wcc-text); border-radius:8px; padding:7px 9px; cursor:pointer; }
    #${APP_ID} button:hover { border-color:#627489; background:#273342; }
    #${APP_ID} button:focus-visible,#${LAB_ID} button:focus-visible { outline:2px solid var(--wcc-accent,#69b7ff); outline-offset:2px; }
    #${APP_ID} button[aria-pressed="true"] { border-color:var(--wcc-accent); box-shadow:inset 0 0 0 1px var(--wcc-accent); }
    #${APP_ID} button:disabled { opacity:.55; cursor:not-allowed; }
    #${APP_ID} .wcc-iconbtn { width:30px; height:30px; padding:0; display:grid; place-items:center; }
    #${APP_ID} .wcc-tabs { display:flex; overflow:auto; gap:0; border-bottom:1px solid var(--wcc-border); background:#10161d; scrollbar-width:thin; }
    #${APP_ID} .wcc-tabs button { flex:0 0 auto; border:0; border-right:1px solid #26313d; border-radius:0; background:transparent; padding:8px 10px; color:var(--wcc-muted); }
    #${APP_ID} .wcc-tabs button[aria-selected="true"] { color:#fff; background:#1d2732; box-shadow:inset 0 -2px 0 var(--wcc-accent); }
    #${APP_ID} .wcc-body { max-height:min(690px,calc(100vh - 103px)); overflow:auto; }
    #${APP_ID} .wcc-panel { display:none; }
    #${APP_ID} .wcc-panel[data-active="true"] { display:block; }
    #${APP_ID} .wcc-section { padding:11px 12px; border-bottom:1px solid var(--wcc-border); }
    #${APP_ID} .wcc-section:last-child { border-bottom:0; }
    #${APP_ID} .wcc-label { color:var(--wcc-muted); font-size:11px; text-transform:uppercase; letter-spacing:.065em; margin-bottom:7px; font-weight:750; }
    #${APP_ID} .wcc-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
    #${APP_ID} .wcc-grid3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
    #${APP_ID} .wcc-grid4 { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; }
    #${APP_ID} .wcc-stack { display:grid; gap:7px; }
    #${APP_ID} .wcc-info { background:var(--wcc-panel); border:1px solid var(--wcc-border); border-radius:9px; padding:8px; overflow-wrap:anywhere; }
    #${APP_ID} .wcc-kv { display:grid; grid-template-columns:88px minmax(0,1fr); gap:5px 8px; }
    #${APP_ID} .wcc-k { color:var(--wcc-muted); }
    #${APP_ID} .wcc-v { min-width:0; overflow-wrap:anywhere; }
    #${APP_ID} .wcc-code { font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
    #${APP_ID} .wcc-status { color:var(--wcc-muted); padding:7px 12px; background:#0b1015; border-top:1px solid var(--wcc-border); min-height:31px; }
    #${APP_ID} .wcc-status[data-tone="good"] { color:var(--wcc-good); }
    #${APP_ID} .wcc-status[data-tone="warn"] { color:var(--wcc-warn); }
    #${APP_ID} .wcc-status[data-tone="bad"] { color:var(--wcc-bad); }
    #${APP_ID} .wcc-empty { color:var(--wcc-muted); font-style:italic; }
    #${APP_ID} .wcc-hidden { display:none !important; }
    #${APP_ID} .wcc-input { width:100%; border:1px solid var(--wcc-border); background:#0e141a; color:var(--wcc-text); border-radius:8px; padding:8px; }
    #${APP_ID} .wcc-help { color:var(--wcc-muted); font-size:11px; margin-top:6px; }
    #${APP_ID} .wcc-pills { display:flex; flex-wrap:wrap; gap:5px; }
    #${APP_ID} .wcc-pill { border:1px solid var(--wcc-border); border-radius:999px; padding:2px 6px; color:var(--wcc-muted); background:#131a22; font-size:10px; }
    #${APP_ID} .wcc-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; margin-bottom:8px; }
    #${APP_ID} .wcc-stat { background:#111820; border:1px solid var(--wcc-border); border-radius:8px; padding:7px; text-align:center; }
    #${APP_ID} .wcc-stat strong { display:block; font-size:16px; line-height:1.15; }
    #${APP_ID} .wcc-stat span { color:var(--wcc-muted); font-size:9px; }
    #${APP_ID} .wcc-result-list { display:grid; gap:6px; max-height:350px; overflow:auto; }
    #${APP_ID} .wcc-result { border:1px solid var(--wcc-border); background:#121920; border-radius:8px; padding:7px; }
    #${APP_ID} .wcc-result-head { display:flex; gap:6px; align-items:flex-start; }
    #${APP_ID} .wcc-result-title { flex:1; min-width:0; font-weight:650; overflow-wrap:anywhere; }
    #${APP_ID} .wcc-result-meta { color:var(--wcc-muted); font-size:11px; margin-top:3px; overflow-wrap:anywhere; }
    #${APP_ID} .wcc-result-actions { display:flex; gap:5px; margin-top:6px; }
    #${APP_ID} .wcc-result-actions button { padding:4px 7px; font-size:10px; }
    #${APP_ID} .wcc-badge { display:inline-flex; align-items:center; border-radius:999px; border:1px solid var(--wcc-border); padding:1px 6px; font-size:10px; font-weight:750; white-space:nowrap; }
    #${APP_ID} .wcc-badge[data-tone="bad"] { color:var(--wcc-bad); border-color:#7c4046; }
    #${APP_ID} .wcc-badge[data-tone="warn"] { color:var(--wcc-warn); border-color:#766034; }
    #${APP_ID} .wcc-badge[data-tone="good"] { color:var(--wcc-good); border-color:#33644a; }
    #${APP_ID} .wcc-badge[data-tone="info"] { color:var(--wcc-info); border-color:#365e7c; }
    #${APP_ID} .wcc-progress { height:7px; overflow:hidden; background:#0b1015; border:1px solid var(--wcc-border); border-radius:99px; margin:7px 0; }
    #${APP_ID} .wcc-progress > span { display:block; height:100%; width:0; background:var(--wcc-accent); transition:width .15s ease; }
    #${APP_ID} .wcc-review-summary { display:flex; align-items:center; gap:8px; margin-bottom:8px; padding:8px 9px; border:1px solid var(--wcc-border); border-radius:9px; background:#111820; }
    #${APP_ID} .wcc-review-summary strong { font-size:14px; }
    #${APP_ID} .wcc-review-summary span { color:var(--wcc-muted); font-size:11px; margin-left:auto; text-align:right; }
    #${APP_ID} .wcc-review-list { display:grid; gap:8px; }
    #${APP_ID} .wcc-note { display:grid; grid-template-columns:112px minmax(0,1fr); gap:9px; padding:8px; border:1px solid var(--wcc-border); border-radius:10px; background:#121920; }
    #${APP_ID} .wcc-note[data-status="resolved"] { opacity:.68; }
    #${APP_ID} .wcc-note-shot { width:112px; height:78px; border:1px solid #3a4857; border-radius:7px; overflow:hidden; background:#0b1015; display:grid; place-items:center; cursor:pointer; padding:0; }
    #${APP_ID} .wcc-note-shot:hover { border-color:var(--wcc-accent); }
    #${APP_ID} .wcc-note-shot img { width:100%; height:100%; object-fit:cover; display:block; }
    #${APP_ID} .wcc-note-shot span { color:var(--wcc-muted); font-size:10px; text-align:center; padding:6px; }
    #${APP_ID} .wcc-note-main { min-width:0; }
    #${APP_ID} .wcc-note-top { display:flex; gap:7px; align-items:flex-start; }
    #${APP_ID} .wcc-note-num { width:23px; height:23px; border-radius:50%; display:grid; place-items:center; background:#326ea1; color:#fff; flex:0 0 auto; font-weight:750; }
    #${APP_ID} .wcc-note-text { flex:1; min-width:0; font-weight:650; overflow-wrap:anywhere; }
    #${APP_ID} .wcc-note-current { margin-top:5px; color:#c9d2dc; font-size:11px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    #${APP_ID} .wcc-note-actions { display:flex; flex-wrap:wrap; gap:5px; margin-top:7px; }
    #${APP_ID} .wcc-note-actions button { padding:4px 7px; font-size:10px; }
    #${APP_ID} .wcc-note-details { margin-top:6px; }
    #${APP_ID} .wcc-note-details summary { color:var(--wcc-muted); cursor:pointer; font-size:10px; }
    #${APP_ID} .wcc-note-meta { color:var(--wcc-muted); font:10px/1.4 ui-monospace,monospace; overflow-wrap:anywhere; margin-top:4px; user-select:text; }
    #${APP_ID} .wcc-review-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; margin-top:8px; }
    #${APP_ID} .wcc-review-actions .wcc-wide { grid-column:1 / -1; }
    #${APP_ID} .wcc-review-primary { border-color:#4d9ee8 !important; background:#173452 !important; }
    @media (max-width:520px) {
      #${APP_ID} .wcc-note { grid-template-columns:88px minmax(0,1fr); }
      #${APP_ID} .wcc-note-shot { width:88px; height:68px; }
    }
    #${APP_ID} .wcc-principle { display:grid; grid-template-columns:26px minmax(0,1fr); gap:7px; align-items:start; }
    #${APP_ID} .wcc-score-dot { width:22px; height:22px; display:grid; place-items:center; border-radius:50%; border:1px solid var(--wcc-border); font-size:10px; font-weight:750; }
    #${APP_ID} .wcc-score-dot[data-tone="good"] { color:var(--wcc-good); border-color:#33644a; }
    #${APP_ID} .wcc-score-dot[data-tone="warn"] { color:var(--wcc-warn); border-color:#766034; }
    #${APP_ID} .wcc-score-dot[data-tone="info"] { color:var(--wcc-info); border-color:#365e7c; }

    #${LAB_ID}, #${LAB_ID} * { box-sizing:border-box; }
    #${LAB_ID} { position:fixed; inset:0; z-index:2147483647; background:#090d12; color:#f5f7fa; font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; display:flex; flex-direction:column; min-width:0; }
    #${LAB_ID} .wcc-labbar { display:grid; grid-template-columns:minmax(180px,1fr) auto; align-items:center; gap:8px 12px; padding:10px 12px; border-bottom:1px solid #344150; background:#141b23; }
    #${LAB_ID} .wcc-labtitle { font-weight:750; min-width:0; }
    #${LAB_ID} .wcc-labcontrols { display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:7px; }
    #${LAB_ID} button,#${LAB_ID} select { border:1px solid #344150; background:#202a35; color:#f5f7fa; border-radius:8px; padding:7px 9px; font:inherit; }
    #${LAB_ID} button { cursor:pointer; }
    #${LAB_ID} button:hover { border-color:#627489; background:#273342; }
    #${LAB_ID} select { max-width:190px; }
    #${LAB_ID} .wcc-labnote { color:#a6b1be; font-size:11px; grid-column:1 / -1; }
    #${LAB_ID} .wcc-devices { flex:1; min-height:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr)); gap:12px; align-items:start; overflow:auto; padding:14px; }
    #${LAB_ID} .wcc-device { min-width:0; border:1px solid #344150; border-radius:12px; overflow:hidden; background:#111820; }
    #${LAB_ID} .wcc-devicehead { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #344150; background:#171e27; }
    #${LAB_ID} .wcc-devicename { font-weight:700; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #${LAB_ID} .wcc-devicemeta { color:#a6b1be; font:11px/1.4 ui-monospace,monospace; margin-left:auto; white-space:nowrap; }
    #${LAB_ID} .wcc-deviceactions { display:flex; gap:5px; }
    #${LAB_ID} .wcc-deviceactions button { padding:4px 7px; font-size:11px; }
    #${LAB_ID} .wcc-deviceviewport { height:calc(100vh - 145px); min-height:360px; overflow:auto; display:flex; justify-content:center; align-items:flex-start; padding:12px; background:#05080b; }
    #${LAB_ID} .wcc-devicewrap { transform-origin:top left; flex:0 0 auto; }
    #${LAB_ID} iframe { display:block; border:0; background:#fff; transform-origin:top left; }
    #${LAB_ID} .wcc-labempty { grid-column:1 / -1; border:1px dashed #344150; border-radius:12px; padding:30px 18px; color:#a6b1be; text-align:center; }
    @media (max-width:760px) {
      #${LAB_ID} .wcc-labbar { grid-template-columns:1fr; }
      #${LAB_ID} .wcc-labcontrols { justify-content:flex-start; }
      #${LAB_ID} .wcc-labnote { grid-column:1; }
      #${LAB_ID} .wcc-devices { grid-template-columns:1fr; padding:10px; }
      #${LAB_ID} .wcc-deviceviewport { height:calc(100vh - 205px); }
    }

    #${HILITE_ID} { position:fixed; pointer-events:none; z-index:2147483645; border:2px solid #43a6ff; background:rgba(67,166,255,.10); box-shadow:0 0 0 1px rgba(0,0,0,.35); }
    .wcc-annot-pin { position:absolute !important; z-index:2147483644 !important; width:28px !important; height:28px !important; border-radius:50% !important; display:grid !important; place-items:center !important; border:2px solid #fff !important; background:#175f96 !important; color:#fff !important; box-shadow:0 2px 9px rgba(0,0,0,.4) !important; font:700 12px/1 Arial,sans-serif !important; cursor:pointer !important; }
    html.wcc-outline-all *:not(#${APP_ID}):not(#${APP_ID} *):not(#${LAB_ID}):not(#${LAB_ID} *) { outline:1px solid rgba(255,85,85,.35) !important; }
    html.wcc-grayscale body > *:not(#${APP_ID}):not(#${LAB_ID}) { filter:grayscale(1) !important; }
  `;

  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.documentElement.appendChild(style);
  }

  function esc(s = '') {
    return String(s).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  }

  function setStatus(message, tone = '') {
    const el = document.querySelector(`#${APP_ID} .wcc-status`);
    if (!el) return;
    el.textContent = message;
    el.dataset.tone = tone;
  }

  function copy(text, label = 'Copied') {
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      setStatus(label, 'good');
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => setStatus(label, 'good')).catch(fallback);
    else fallback();
  }

  function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function slugify(s) {
    return String(s || 'page').toLowerCase().replace(/https?:\/\//g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'page';
  }

  function isVisible(el) {
    if (!el || !(el instanceof Element)) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) !== 0 && r.width > 0 && r.height > 0;
  }

  function visibleText(el) {
    if (!isVisible(el)) return '';
    return (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
  }

  function rgbaToHex(color) {
    if (!color) return null;
    if (color.startsWith('#')) return color.toUpperCase();
    const m = color.match(/rgba?\((\d+)\D+(\d+)\D+(\d+)(?:\D+([\d.]+))?\)/i);
    if (!m) return color;
    const [r, g, b] = [m[1], m[2], m[3]].map(Number);
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function parseRgb(color) {
    if (!color) return null;
    if (color.startsWith('#')) {
      let h = color.slice(1);
      if (h.length === 3) h = h.split('').map(x => x + x).join('');
      if (h.length < 6) return null;
      return { r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16), a:1 };
    }
    const m = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,\/]\s*([\d.]+))?\s*\)/i);
    return m ? { r:+m[1], g:+m[2], b:+m[3], a:m[4] == null ? 1 : +m[4] } : null;
  }

  function isTransparent(color) {
    const c = parseRgb(color);
    return !c || c.a === 0;
  }

  function effectiveBackground(el) {
    let node = el;
    while (node && node instanceof Element) {
      const bg = getComputedStyle(node).backgroundColor;
      const c = parseRgb(bg);
      if (c && c.a > 0.95) return bg;
      node = node.parentElement;
    }
    return 'rgb(255,255,255)';
  }

  function luminance(color) {
    const c = parseRgb(color);
    if (!c) return null;
    const vals = [c.r, c.g, c.b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2];
  }

  function contrastRatio(a, b) {
    const l1 = luminance(a), l2 = luminance(b);
    if (l1 == null || l2 == null) return null;
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  function cssSelector(el) {
    if (!(el instanceof Element)) return '';
    if (el.id && !/^\d/.test(el.id)) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      let part = node.tagName.toLowerCase();
      const useful = [...node.classList].filter(c => !c.startsWith('wcc-')).slice(0, 2);
      if (useful.length) part += '.' + useful.map(c => CSS.escape(c)).join('.');
      const parent = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter(x => x.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      const test = parts.join(' > ');
      try { if (document.querySelectorAll(test).length === 1) return test; } catch (_) {}
      node = parent;
    }
    return parts.join(' > ');
  }

  function xpath(el) {
    if (!(el instanceof Element)) return '';
    const segs = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      let i = 1;
      for (let sib = node.previousElementSibling; sib; sib = sib.previousElementSibling) if (sib.tagName === node.tagName) i++;
      segs.unshift(`${node.tagName.toLowerCase()}[${i}]`);
      if (node === document.documentElement) break;
    }
    return '/' + segs.join('/');
  }

  function ensureHighlight() {
    let h = document.getElementById(HILITE_ID);
    if (!h) {
      h = document.createElement('div');
      h.id = HILITE_ID;
      h.hidden = true;
      document.documentElement.appendChild(h);
    }
    return h;
  }

  function highlight(el) {
    const h = ensureHighlight();
    if (!el || el.closest?.(`#${APP_ID}`) || el.closest?.(`#${LAB_ID}`)) { h.hidden = true; return; }
    const r = el.getBoundingClientRect();
    Object.assign(h.style, { left:r.left + 'px', top:r.top + 'px', width:r.width + 'px', height:r.height + 'px' });
    h.hidden = false;
  }

  function clearHighlight() {
    const h = document.getElementById(HILITE_ID);
    if (h) h.hidden = true;
  }

  function selectedInfo(el) {
    if (!el) return null;
    const s = getComputedStyle(el), rect = el.getBoundingClientRect();
    const bg = effectiveBackground(el), fg = s.color, ratio = contrastRatio(fg, bg);
    const box = {
      margin: `${s.marginTop} ${s.marginRight} ${s.marginBottom} ${s.marginLeft}`,
      padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
      border: `${s.borderTopWidth} ${s.borderRightWidth} ${s.borderBottomWidth} ${s.borderLeftWidth}`
    };
    return {
      tag:el.tagName.toLowerCase(), id:el.id || '', classes:[...el.classList].filter(c => !c.startsWith('wcc-')).join(' '),
      selector:cssSelector(el), xpath:xpath(el), size:`${Math.round(rect.width)} × ${Math.round(rect.height)} px`,
      font:`${s.fontWeight} ${s.fontSize}/${s.lineHeight} ${s.fontFamily}`, color:rgbaToHex(fg), background:rgbaToHex(bg),
      contrast:ratio ? ratio.toFixed(2) + ':1' : 'n/a', contrastPass:ratio ? (ratio >= 4.5 ? 'AA normal text' : ratio >= 3 ? 'AA large text only' : 'Fails AA') : 'Unknown',
      role:el.getAttribute('role') || '', aria:el.getAttribute('aria-label') || '', box,
      position:s.position, display:s.display, zIndex:s.zIndex,
      text:(el.innerText || el.textContent || '').trim().replace(/\s+/g,' ').slice(0,240)
    };
  }

  function renderSelected() {
    const box = document.querySelector(`#${APP_ID} [data-selected]`);
    if (!box) return;
    const i = selectedInfo(state.selectedEl);
    if (!i) { box.innerHTML = '<div class="wcc-empty">Inspect an element to see computed details.</div>'; return; }
    box.innerHTML = `
      <div class="wcc-kv">
        <div class="wcc-k">Element</div><div class="wcc-v wcc-code">&lt;${esc(i.tag)}${i.id ? ` id="${esc(i.id)}"` : ''}&gt;</div>
        <div class="wcc-k">Selector</div><div class="wcc-v wcc-code">${esc(i.selector)}</div>
        <div class="wcc-k">Size</div><div class="wcc-v">${esc(i.size)}</div>
        <div class="wcc-k">Font</div><div class="wcc-v">${esc(i.font)}</div>
        <div class="wcc-k">Text</div><div class="wcc-v">${esc(i.color)}</div>
        <div class="wcc-k">Background</div><div class="wcc-v">${esc(i.background)}</div>
        <div class="wcc-k">Contrast</div><div class="wcc-v">${esc(i.contrast)} — ${esc(i.contrastPass)}</div>
        <div class="wcc-k">Margin</div><div class="wcc-v wcc-code">${esc(i.box.margin)}</div>
        <div class="wcc-k">Padding</div><div class="wcc-v wcc-code">${esc(i.box.padding)}</div>
        <div class="wcc-k">Display</div><div class="wcc-v">${esc(i.display)} / ${esc(i.position)}</div>
        ${i.role ? `<div class="wcc-k">Role</div><div class="wcc-v">${esc(i.role)}</div>` : ''}
        ${i.aria ? `<div class="wcc-k">ARIA label</div><div class="wcc-v">${esc(i.aria)}</div>` : ''}
      </div>
      <div class="wcc-grid3" style="margin-top:8px">
        <button data-copy-selector>Selector</button><button data-copy-xpath>XPath</button><button data-copy-css>Details</button>
      </div>`;
    box.querySelector('[data-copy-selector]').onclick = () => copy(i.selector, 'Selector copied');
    box.querySelector('[data-copy-xpath]').onclick = () => copy(i.xpath, 'XPath copied');
    box.querySelector('[data-copy-css]').onclick = () => copy(JSON.stringify(i, null, 2), 'Element details copied');
  }

  function persistNotes() {
    const all = GM_getValue(STORAGE.notes, {});
    all[location.href] = state.notes;
    GM_setValue(STORAGE.notes, all);
    renderPins();
    renderNotes();
  }

  function noteTarget(note) {
    if (!note?.selector) return null;
    try { return document.querySelector(note.selector); } catch (_) { return null; }
  }

  async function captureReviewClip(el) {
    if (!(el instanceof Element) || typeof html2canvas === 'undefined') return '';
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return '';

    // Capture a small amount of page context around the exact element, then draw a target frame.
    const docW = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0, innerWidth);
    const docH = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0, innerHeight);
    const targetX = r.left + scrollX, targetY = r.top + scrollY;
    const cropW = Math.min(docW, Math.max(340, Math.min(900, r.width + 120)));
    const cropH = Math.min(docH, Math.max(210, Math.min(520, r.height + 110)));
    const x = Math.max(0, Math.min(docW - cropW, targetX + r.width / 2 - cropW / 2));
    const y = Math.max(0, Math.min(docH - cropH, targetY + r.height / 2 - cropH / 2));

    const hidden = [];
    [document.getElementById(APP_ID), document.getElementById(HILITE_ID), ...document.querySelectorAll('.wcc-annot-pin')].filter(Boolean).forEach(node => {
      hidden.push([node, node.style.visibility]); node.style.visibility = 'hidden';
    });

    try {
      const canvas = await html2canvas(document.documentElement, {
        useCORS:true, allowTaint:false, logging:false, scale:1.25,
        x, y, width:cropW, height:cropH, scrollX:0, scrollY:0,
        windowWidth:docW, windowHeight:docH,
        backgroundColor:getComputedStyle(document.body).backgroundColor || '#ffffff'
      });
      const sx = canvas.width / cropW, sy = canvas.height / cropH;
      const fx = Math.max(0,(targetX - x) * sx), fy = Math.max(0,(targetY - y) * sy);
      const fw = Math.min(canvas.width - fx, r.width * sx), fh = Math.min(canvas.height - fy, r.height * sy);
      const ctx = canvas.getContext('2d');
      ctx.save();
      ctx.strokeStyle = '#1778D4';
      ctx.lineWidth = Math.max(3, 3 * sx);
      ctx.shadowColor = 'rgba(0,0,0,.35)';
      ctx.shadowBlur = 4 * sx;
      ctx.strokeRect(fx + 2, fy + 2, Math.max(1,fw - 4), Math.max(1,fh - 4));
      ctx.restore();

      // Keep Tampermonkey storage reasonable by downscaling review clips.
      const maxW = 760, maxH = 440;
      const ratio = Math.min(1, maxW / canvas.width, maxH / canvas.height);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(canvas.width * ratio));
      out.height = Math.max(1, Math.round(canvas.height * ratio));
      out.getContext('2d').drawImage(canvas,0,0,out.width,out.height);
      return out.toDataURL('image/jpeg', .80);
    } finally {
      hidden.forEach(([node,visibility]) => node.style.visibility = visibility);
    }
  }

  async function addNote(el) {
    const comment = window.prompt('What should be changed?');
    if (!comment?.trim()) return;
    const rect = el.getBoundingClientRect();
    const note = {
      id:crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
      comment:comment.trim(), selector:cssSelector(el), xpath:xpath(el), status:'open', clip:'',
      text:(el.innerText || el.textContent || el.getAttribute?.('alt') || el.getAttribute?.('aria-label') || '').trim().replace(/\s+/g,' ').slice(0,220),
      pageX:rect.left + scrollX, pageY:rect.top + scrollY, url:location.href, createdAt:new Date().toISOString(),
      viewport:`${innerWidth} × ${innerHeight}`
    };
    state.notes.push(note);
    persistNotes();
    setStatus('Change added — capturing visual clip…');
    try { note.clip = await captureReviewClip(el); }
    catch (e) { console.warn('Review clip capture failed',e); }
    persistNotes();
    setStatus(note.clip ? 'Change request + visual clip added' : 'Change request added (clip unavailable)', note.clip ? 'good' : 'warn');
  }

  function removeNote(id) { state.notes = state.notes.filter(n => n.id !== id); persistNotes(); }

  function editNote(id) {
    const n = state.notes.find(x => x.id === id); if (!n) return;
    const next = window.prompt('Update the change request:', n.comment);
    if (!next?.trim()) return;
    n.comment = next.trim(); persistNotes(); setStatus('Change request updated','good');
  }

  function toggleNoteResolved(id) {
    const n = state.notes.find(x => x.id === id); if (!n) return;
    n.status = n.status === 'resolved' ? 'open' : 'resolved'; persistNotes();
    setStatus(n.status === 'resolved' ? 'Marked resolved' : 'Reopened change request','good');
  }

  function focusNote(id) {
    const n = state.notes.find(x => x.id === id); if (!n) return;
    const el = noteTarget(n);
    if (!el) return setStatus('That element can no longer be found on the current DOM','warn');
    el.scrollIntoView({behavior:'smooth',block:'center'}); highlight(el); state.selectedEl = el; renderSelected();
    setStatus('Located annotated element','good');
  }

  async function recaptureNote(id) {
    const n = state.notes.find(x => x.id === id); if (!n) return;
    const el = noteTarget(n);
    if (!el) return setStatus('Could not find that element to capture it','warn');
    setStatus('Capturing visual clip…');
    try { n.clip = await captureReviewClip(el); persistNotes(); setStatus(n.clip ? 'Visual clip updated' : 'Clip unavailable','good'); }
    catch (e) { console.warn(e); setStatus('Could not capture that element','bad'); }
  }

  function notePlainText(n, idx, includeSelector = true) {
    const lines = [`${idx + 1}. ${n.comment}`];
    if (n.text) lines.push(`Current: “${n.text}”`);
    if (includeSelector && n.selector) lines.push(`Developer selector: ${n.selector}`);
    return lines.join('\n');
  }

  function reviewPlainText() {
    const open = state.notes.filter(n => n.status !== 'resolved').length;
    const lines = [`WEBSITE REVIEW — ${document.title || location.hostname}`, location.href, `${open} open change${open === 1 ? '' : 's'} · ${state.notes.length} total`, ''];
    state.notes.forEach((n,i) => { lines.push(notePlainText(n,i,true), n.status === 'resolved' ? 'Status: Resolved' : 'Status: Open', ''); });
    return lines.join('\n').trim();
  }

  function reviewHtml() {
    const open = state.notes.filter(n => n.status !== 'resolved').length;
    const items = state.notes.map((n,i) => `<li style="margin:0 0 12px"><strong>${esc(n.comment)}</strong>${n.text ? `<br><span>Current: “${esc(n.text)}”</span>` : ''}<br><span style="color:#555">Status: ${n.status === 'resolved' ? 'Resolved' : 'Open'}</span>${n.selector ? `<br><span style="font-family:Consolas,monospace;font-size:11px;color:#666">Selector: ${esc(n.selector)}</span>` : ''}</li>`).join('');
    return `<div><p style="margin:0 0 4px"><strong>Website review — ${esc(document.title || location.hostname)}</strong></p><p style="margin:0 0 12px"><a href="${esc(location.href)}">${esc(location.href)}</a><br>${open} open change${open === 1 ? '' : 's'} · ${state.notes.length} total</p><ol>${items}</ol></div>`;
  }

  async function copyForTeams() {
    if (!state.notes.length) return setStatus('Add at least one change request first','warn');
    const plain = reviewPlainText(), html = reviewHtml();
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({
          'text/plain':new Blob([plain],{type:'text/plain'}),
          'text/html':new Blob([html],{type:'text/html'})
        })]);
        setStatus('Teams-ready review copied','good');
      } else copy(plain,'Teams-ready review copied');
    } catch (_) { copy(plain,'Teams-ready review copied'); }
  }

  function dataUrlBlob(dataUrl) {
    const [head,data] = dataUrl.split(',');
    const mime = (head.match(/data:([^;]+)/) || [,'image/png'])[1];
    const bin = atob(data); const bytes = new Uint8Array(bin.length);
    for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes],{type:mime});
  }

  async function copyClip(id) {
    const n = state.notes.find(x => x.id === id); if (!n) return;
    if (!n.clip) { await recaptureNote(id); }
    if (!n.clip) return;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard unavailable');
      const source = dataUrlBlob(n.clip);
      const bitmap = await createImageBitmap(source);
      const canvas = document.createElement('canvas'); canvas.width=bitmap.width; canvas.height=bitmap.height;
      canvas.getContext('2d').drawImage(bitmap,0,0);
      const png = await new Promise(resolve => canvas.toBlob(resolve,'image/png'));
      await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
      setStatus('Visual clip copied — paste directly into Teams','good');
    } catch (e) {
      const a=document.createElement('a'); a.download=`review-change-${state.notes.indexOf(n)+1}.jpg`; a.href=n.clip; a.click();
      setStatus('Clipboard image was blocked; downloaded the clip instead','warn');
    }
  }

  function loadReviewImage(src) {
    return new Promise((resolve,reject) => { const img=new Image(); img.onload=()=>resolve(img); img.onerror=reject; img.src=src; });
  }

  function canvasText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 3) {
    const words = String(text || '').split(/\s+/); let line='', lines=[];
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line=word; }
      else line=test;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) { lines=lines.slice(0,maxLines); lines[maxLines-1]=lines[maxLines-1].replace(/[.,;:]?$/,'…'); }
    lines.forEach((ln,i)=>ctx.fillText(ln,x,y+i*lineHeight));
    return y + lines.length * lineHeight;
  }

  async function createVisualReviewBoard() {
    const notes = state.notes;
    if (!notes.length) return null;
    const W=1180, pad=42, headerH=130, cardH=230, gap=20;
    const canvas=document.createElement('canvas'); canvas.width=W; canvas.height=headerH + notes.length*(cardH+gap) + pad;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#F5F7FA'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle='#0F2942'; ctx.font='700 30px Arial'; ctx.fillText('Website Review',pad,50);
    ctx.fillStyle='#263746'; ctx.font='600 19px Arial'; ctx.fillText(document.title || location.hostname,pad,80);
    ctx.fillStyle='#596B7B'; ctx.font='15px Arial'; canvasText(ctx,location.href,pad,106,W-pad*2,20,1);

    for (let i=0;i<notes.length;i++) {
      const n=notes[i], y=headerH+i*(cardH+gap);
      ctx.fillStyle='#FFFFFF'; ctx.strokeStyle='#D4DCE4'; ctx.lineWidth=2; ctx.beginPath(); ctx.roundRect(pad,y,W-pad*2,cardH,16); ctx.fill(); ctx.stroke();
      const thumbX=pad+18, thumbY=y+18, thumbW=360, thumbH=194;
      ctx.fillStyle='#E9EEF3'; ctx.fillRect(thumbX,thumbY,thumbW,thumbH);
      if (n.clip) {
        try { const img=await loadReviewImage(n.clip); const scale=Math.min(thumbW/img.width,thumbH/img.height); const dw=img.width*scale,dh=img.height*scale; ctx.drawImage(img,thumbX+(thumbW-dw)/2,thumbY+(thumbH-dh)/2,dw,dh); } catch (_) {}
      }
      ctx.strokeStyle='#C6D1DB'; ctx.strokeRect(thumbX,thumbY,thumbW,thumbH);

      const tx=thumbX+thumbW+28, max=W-pad-24-tx;
      ctx.fillStyle='#1778D4'; ctx.beginPath(); ctx.arc(tx+16,y+34,16,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#FFFFFF'; ctx.font='700 16px Arial'; ctx.textAlign='center'; ctx.fillText(String(i+1),tx+16,y+40); ctx.textAlign='left';
      ctx.fillStyle='#102638'; ctx.font='700 21px Arial'; let ty=canvasText(ctx,n.comment,tx+42,y+28,max-42,27,3);
      if (n.text) { ctx.fillStyle='#42596B'; ctx.font='15px Arial'; ty=canvasText(ctx,`Current: “${n.text}”`,tx+42,Math.max(ty+10,y+105),max-42,21,2); }
      ctx.fillStyle='#667A8B'; ctx.font='13px Consolas, monospace'; canvasText(ctx,`Selector: ${n.selector || 'n/a'}`,tx+42,Math.max(ty+14,y+168),max-42,18,2);
      ctx.fillStyle=n.status==='resolved' ? '#367A54' : '#8A5B13'; ctx.font='700 13px Arial'; ctx.fillText(n.status==='resolved'?'RESOLVED':'OPEN',tx+42,y+207);
    }
    return canvas;
  }

  async function copyVisualBoard() {
    if (!state.notes.length) return setStatus('Add at least one change request first','warn');
    setStatus('Building visual review board…');
    try {
      const canvas=await createVisualReviewBoard();
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard unavailable');
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
      setStatus('Visual review board copied — paste it into Teams','good');
    } catch (e) {
      const canvas=await createVisualReviewBoard(); if (!canvas) return;
      const a=document.createElement('a'); a.download=`${slugify(location.hostname+'-'+document.title)}-visual-review.png`; a.href=canvas.toDataURL('image/png'); a.click();
      setStatus('Clipboard image was blocked; downloaded the visual board instead','warn');
    }
  }

  function renderNotes() {
    const box = document.querySelector(`#${APP_ID} [data-notes]`);
    if (!box) return;
    const summary = document.querySelector(`#${APP_ID} [data-review-summary]`);
    const open = state.notes.filter(n => n.status !== 'resolved').length;
    if (summary) summary.innerHTML = `<strong>${open} open</strong><span>${state.notes.length} total change${state.notes.length === 1 ? '' : 's'}</span>`;
    if (!state.notes.length) { box.innerHTML = '<div class="wcc-empty">No changes yet. Select “Annotate page,” then click the exact element you want updated.</div>'; return; }
    box.innerHTML = `<div class="wcc-review-list">${state.notes.map((n, idx) => `
      <div class="wcc-note" data-status="${esc(n.status || 'open')}">
        <button class="wcc-note-shot" data-locate-note="${esc(n.id)}" title="Locate this element on the page">${n.clip ? `<img src="${n.clip}" alt="Visual clip for change ${idx + 1}">` : '<span>Visual clip<br>not captured</span>'}</button>
        <div class="wcc-note-main">
          <div class="wcc-note-top"><div class="wcc-note-num">${idx + 1}</div><div class="wcc-note-text">${esc(n.comment)}</div><button data-delete-note="${esc(n.id)}" title="Delete change">×</button></div>
          ${n.text ? `<div class="wcc-note-current">Current: “${esc(n.text)}”</div>` : ''}
          <div class="wcc-note-actions">
            <button data-locate-note="${esc(n.id)}">Locate</button>
            <button data-edit-note="${esc(n.id)}">Edit</button>
            <button data-copy-note="${esc(n.id)}">Copy text</button>
            <button data-copy-clip="${esc(n.id)}">${n.clip ? 'Copy clip' : 'Capture clip'}</button>
            <button data-resolve-note="${esc(n.id)}">${n.status === 'resolved' ? 'Reopen' : 'Done'}</button>
          </div>
          <details class="wcc-note-details"><summary>Developer details</summary><div class="wcc-note-meta">${esc(n.selector)}</div><div class="wcc-note-meta">${esc(n.xpath || '')}</div></details>
        </div>
      </div>`).join('')}</div>`;
    box.querySelectorAll('[data-delete-note]').forEach(btn => btn.onclick = () => removeNote(btn.dataset.deleteNote));
    box.querySelectorAll('[data-edit-note]').forEach(btn => btn.onclick = () => editNote(btn.dataset.editNote));
    box.querySelectorAll('[data-resolve-note]').forEach(btn => btn.onclick = () => toggleNoteResolved(btn.dataset.resolveNote));
    box.querySelectorAll('[data-locate-note]').forEach(btn => btn.onclick = () => focusNote(btn.dataset.locateNote));
    box.querySelectorAll('[data-copy-note]').forEach(btn => btn.onclick = () => { const n=state.notes.find(x=>x.id===btn.dataset.copyNote); if(n) copy(notePlainText(n,state.notes.indexOf(n),true),'Change request copied'); });
    box.querySelectorAll('[data-copy-clip]').forEach(btn => btn.onclick = () => copyClip(btn.dataset.copyClip));
  }

  function renderPins() {
    document.querySelectorAll('.wcc-annot-pin').forEach(x => x.remove());
    state.notes.forEach((n, idx) => {
      let target = null;
      try { target = document.querySelector(n.selector); } catch (_) {}
      let x = n.pageX, y = n.pageY;
      if (target) { const r = target.getBoundingClientRect(); x = r.left + scrollX; y = r.top + scrollY; }
      const pin = document.createElement('button');
      pin.className = 'wcc-annot-pin'; pin.type = 'button'; pin.textContent = String(idx + 1); pin.title = n.comment;
      pin.style.left = Math.max(0, x - 12) + 'px'; pin.style.top = Math.max(0, y - 12) + 'px';
      pin.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); setTab('review'); focusNote(n.id); setStatus(`Change ${idx + 1}: ${n.comment}`); };
      document.body.appendChild(pin);
    });
  }

  function pagePalette(limit = 12) {
    const counts = new Map();
    [...document.querySelectorAll('body *')].filter(el => !el.closest(`#${APP_ID}`)).slice(0, 3500).forEach(el => {
      const s = getComputedStyle(el);
      [s.color, s.backgroundColor, s.borderTopColor].forEach(c => {
        if (!c || isTransparent(c)) return;
        const h = rgbaToHex(c); counts.set(h, (counts.get(h) || 0) + 1);
      });
    });
    return [...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0, limit).map(([color,count]) => ({ color,count }));
  }

  function pageFonts(limit = 10) {
    const counts = new Map();
    [...document.querySelectorAll('body *')].filter(el => !el.closest(`#${APP_ID}`)).slice(0,3500).forEach(el => {
      const ff = getComputedStyle(el).fontFamily;
      if (ff) counts.set(ff, (counts.get(ff) || 0) + 1);
    });
    return [...counts.entries()].sort((a,b) => b[1] - a[1]).slice(0,limit).map(([font,count]) => ({ font,count }));
  }

  function campaignSignals() {
    const body = (document.body.innerText || '').toLowerCase();
    const ctas = [...document.querySelectorAll('a,button,input[type="submit"]')]
      .filter(el => !el.closest(`#${APP_ID}`))
      .map(el => visibleText(el) || el.value || el.getAttribute('aria-label') || '')
      .map(x => x.trim()).filter(x => x && x.length < 90).slice(0,160);
    const all = body + ' ' + ctas.join(' ');
    const categories = [
      { key:'recruitment', label:'Recruitment / hiring', terms:['apply now','join our team','careers','career','jobs','job openings','recruit','hiring','become a','join us'] },
      { key:'event', label:'Event attendance / promotion', terms:['register','tickets','event','festival','rsvp','save the date','attend','schedule','lineup'] },
      { key:'service', label:'Public service / program adoption', terms:['apply','eligibility','program','service','services','get started','enroll','request','permit','benefits'] },
      { key:'awareness', label:'Public awareness / education', terms:['learn more','awareness','resources','know the facts','safety','education','understand','information'] },
      { key:'lead', label:'Lead generation / inquiry', terms:['contact us','request a quote','free consultation','book a call','schedule a call','get a quote','contact'] },
      { key:'sales', label:'Sales / conversion', terms:['buy now','shop now','add to cart','pricing','purchase','start free','free trial','subscribe'] },
      { key:'donation', label:'Fundraising / donation', terms:['donate','give now','support us','fundraiser','contribute','sponsor'] },
      { key:'signup', label:'Signup / membership', terms:['sign up','create account','join now','membership','newsletter','subscribe'] }
    ];
    const scored = categories.map(c => ({ ...c, score:c.terms.reduce((sum,t) => sum + (all.includes(t) ? 1 : 0),0) })).sort((a,b) => b.score - a.score);
    const top = scored[0];
    const confidence = top.score >= 4 ? 'high' : top.score >= 2 ? 'medium' : top.score === 1 ? 'low' : 'unknown';
    return { likelyObjective:top.score ? top.label : 'General information / unclear conversion goal', confidence, scores:scored, ctas };
  }

  function renderCampaign() {
    const box = document.querySelector(`#${APP_ID} [data-campaign]`);
    if (!box) return;
    const c = campaignSignals();
    const top = c.scores.slice(0,3).map(x => `<span class="wcc-pill">${esc(x.label)} ${x.score}</span>`).join('');
    box.innerHTML = `<div class="wcc-info"><strong>${esc(c.likelyObjective)}</strong><div class="wcc-result-meta">Confidence: ${esc(c.confidence)}</div><div class="wcc-pills" style="margin-top:6px">${top}</div></div>`;
  }

  function countWords(text) { return (String(text).trim().match(/\b[\w’'-]+\b/g) || []).length; }
  function countSentences(text) { return Math.max(1, (String(text).match(/[.!?]+(?:\s|$)/g) || []).length); }
  function countSyllables(word) {
    word = String(word).toLowerCase().replace(/[^a-z]/g,'');
    if (word.length <= 3) return 1;
    word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/,'').replace(/^y/,'');
    const m = word.match(/[aeiouy]{1,2}/g);
    return Math.max(1, m ? m.length : 1);
  }
  function readingGrade(text) {
    const words = (String(text).toLowerCase().match(/\b[a-z]+\b/g) || []).slice(0,5000);
    if (!words.length) return null;
    const sentences = countSentences(text);
    const syllables = words.reduce((n,w) => n + countSyllables(w),0);
    return 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
  }

  function performanceSnapshot() {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const transferBytes = resources.reduce((n,r) => n + (r.transferSize || 0),0);
    const decodedBytes = resources.reduce((n,r) => n + (r.decodedBodySize || 0),0);
    const images = [...document.images].filter(img => !img.closest(`#${APP_ID}`));
    return {
      domNodes:document.getElementsByTagName('*').length,
      resources:resources.length,
      transferBytes,
      decodedBytes,
      domContentLoadedMs:nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      loadMs:nav ? Math.round(nav.loadEventEnd) : null,
      images:images.length,
      imagesMissingDimensions:images.filter(i => !i.getAttribute('width') && !i.getAttribute('height')).length,
      belowFoldImagesNotLazy:images.filter(i => i.getBoundingClientRect().top > innerHeight * 1.5 && i.loading !== 'lazy').length,
      headBlockingScripts:[...document.head.querySelectorAll('script[src]')].filter(s => !s.async && !s.defer && s.type !== 'module').length
    };
  }

  function isCaliforniaStateSite() {
    const h = location.hostname.toLowerCase();
    return h === 'ca.gov' || h.endsWith('.ca.gov');
  }

  function detectAnalytics() {
    const html = document.documentElement.innerHTML;
    const scripts = [...document.scripts].map(s => s.src || s.textContent || '').join('\n');
    return {
      ga4:/G-[A-Z0-9]{6,}|gtag\(|googletagmanager\.com\/gtag/i.test(scripts + html),
      gtm:/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i.test(scripts + html),
      matomo:/matomo|piwik/i.test(scripts + html),
      adobe:/adobedtm|launch-[\w-]+\.min\.js|adobeDataLayer/i.test(scripts + html)
    };
  }

  function developerSnapshot() {
    const headings = [...document.querySelectorAll('h1,h2,h3,h4')].filter(el => !el.closest(`#${APP_ID}`)).map(el => ({ level:el.tagName.toLowerCase(), text:visibleText(el) })).filter(x => x.text).slice(0,120);
    const metas = {
      description:document.querySelector('meta[name="description"]')?.content || '',
      ogTitle:document.querySelector('meta[property="og:title"]')?.content || '',
      ogDescription:document.querySelector('meta[property="og:description"]')?.content || '',
      canonical:document.querySelector('link[rel="canonical"]')?.href || '',
      viewport:document.querySelector('meta[name="viewport"]')?.content || ''
    };
    const forms = [...document.forms].slice(0,30).map(f => ({ action:f.action, method:f.method, fields:[...f.elements].map(e => ({ name:e.name || '', type:e.type || '', autocomplete:e.autocomplete || '' })).slice(0,40) }));
    const links = [...document.querySelectorAll('a[href]')].filter(a => !a.closest(`#${APP_ID}`)).map(a => ({ text:visibleText(a).slice(0,120), href:a.href })).slice(0,180);
    const signals = campaignSignals();
    const perf = performanceSnapshot();
    return {
      url:location.href, title:document.title, metas, headings,
      bodyText:(document.body.innerText || '').trim().replace(/\s+/g,' ').slice(0,22000),
      ctas:signals.ctas,
      campaignIntent:{ likelyObjective:signals.likelyObjective, confidence:signals.confidence, scores:signals.scores.map(({label,score}) => ({label,score})) },
      palette:pagePalette(), fonts:pageFonts(), forms, links,
      viewport:{ width:innerWidth, height:innerHeight, dpr:devicePixelRatio || 1 },
      performance:perf, analytics:detectAnalytics(), californiaStateSite:isCaliforniaStateSite(),
      notes:state.notes,
      auditSnapshot:{
        accessibility:state.axeResults ? summarizeAxe(state.axeResults) : null,
        californiaStandards:state.standardsResults.slice(0,80),
        engineering:state.engineeringResults.slice(0,80),
        brokenLinks:state.linkResults.filter(x => ['broken','error'].includes(x.classification)).slice(0,50)
      },
    };
  }

  function inspirationQueries() {
    const c = campaignSignals();
    const h1 = visibleText(document.querySelector('h1')) || document.title;
    const topic = (h1 || document.title).replace(/[-|–—].*$/,'').trim().slice(0,90);
    const objective = c.likelyObjective.replace(/\s*\/.*$/,'');
    return [
      `${topic} ${objective} public sector campaign website examples`,
      `${objective} landing page best practices ${topic}`,
      `government ${objective} campaign UX case study`,
      `site:behance.net ${objective} public service campaign website`,
      `site:awwwards.com ${objective} landing page`
    ];
  }

  function openResearchTabs() {
    inspirationQueries().forEach((q,i) => setTimeout(() => window.open(`https://www.google.com/search?q=${encodeURIComponent(q)}`, '_blank', 'noopener'), i * 160));
    setStatus('Opened targeted inspiration searches', 'good');
  }


  function issue(severity, category, title, detail, standard = '', el = null, type = 'automated') {
    return { severity, category, title, detail, standard, selector:el ? cssSelector(el) : '', type };
  }

  function customAccessibilityChecks(profile = state.a11yProfile) {
    const out = [];
    const html = document.documentElement;
    if (!html.lang?.trim()) out.push(issue('serious','Accessibility','Missing document language','Add a valid lang attribute to <html> so assistive technologies can select the correct language.','WCAG 3.1.1'));
    if (!document.title.trim()) out.push(issue('serious','Accessibility','Missing page title','Provide a descriptive, unique <title>.','WCAG 2.4.2'));

    const vp = document.querySelector('meta[name="viewport"]')?.content || '';
    if (/user-scalable\s*=\s*no/i.test(vp) || /maximum-scale\s*=\s*1(?:\.0)?(?:\D|$)/i.test(vp)) out.push(issue('serious','Accessibility','Zoom appears restricted','Do not prevent users from zooming the page.','WCAG 1.4.4'));

    const h1s = [...document.querySelectorAll('h1')].filter(el => !el.closest(`#${APP_ID}`) && isVisible(el));
    if (h1s.length === 0) out.push(issue('moderate','Structure','No visible H1','Provide a clear page-level heading that identifies the page purpose.','Best practice / WCAG 2.4.6'));
    if (h1s.length > 1) out.push(issue('minor','Structure','Multiple visible H1 headings',`${h1s.length} visible H1s found. Multiple H1s are technically possible, but confirm the document hierarchy is intentional.`,'Heading hierarchy',h1s[1],'review'));

    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(el => !el.closest(`#${APP_ID}`) && isVisible(el));
    let previous = 0;
    headings.forEach(h => {
      const level = Number(h.tagName[1]);
      if (previous && level > previous + 1) out.push(issue('moderate','Structure','Heading level skipped',`${h.tagName} follows H${previous}. Verify the semantic hierarchy rather than choosing headings for visual size.`,'WCAG 1.3.1',h));
      previous = level;
    });

    const mains = [...document.querySelectorAll('main,[role="main"]')].filter(isVisible);
    if (!mains.length) out.push(issue('moderate','Landmarks','No main landmark','Wrap primary content in <main> or role="main".','WCAG 1.3.1 / 2.4.1'));
    if (mains.length > 1) out.push(issue('moderate','Landmarks','Multiple main landmarks',`${mains.length} visible main landmarks found; each should be uniquely identifiable if multiple are required.`,'ARIA landmark best practice',mains[1]));

    const skipLinks = [...document.querySelectorAll('a[href^="#"]')].filter(a => /skip/i.test(visibleText(a)));
    if (!skipLinks.length) out.push(issue('moderate','Keyboard','No obvious skip link detected','Provide a keyboard-accessible mechanism to bypass repeated navigation.','WCAG 2.4.1',null,'review'));

    [...document.images].filter(img => !img.closest(`#${APP_ID}`)).forEach(img => {
      if (!img.hasAttribute('alt')) out.push(issue('critical','Images','Image missing alt attribute','Add meaningful alt text, or alt="" for a decorative image.','WCAG 1.1.1',img));
    });

    [...document.querySelectorAll('iframe')].filter(f => !f.closest(`#${LAB_ID}`)).forEach(f => {
      if (!f.getAttribute('title')?.trim()) out.push(issue('serious','Embedded content','Iframe missing title','Give embedded content a concise descriptive title.','WCAG 4.1.2',f));
    });

    [...document.querySelectorAll('video')].forEach(v => {
      if (!v.querySelector('track[kind="captions"]')) out.push(issue('serious','Media','Video has no captions track detected','Verify synchronized captions are available for prerecorded video with audio.','WCAG 1.2.2',v,'review'));
      if (v.autoplay && !v.muted) out.push(issue('serious','Media','Autoplaying media may include audio','Provide a mechanism to stop/pause audio and avoid unexpected audio playback.','WCAG 1.4.2',v,'review'));
    });

    const vague = /^(click here|here|read more|more|learn more|details)$/i;
    [...document.querySelectorAll('a[href]')].filter(a => !a.closest(`#${APP_ID}`) && isVisible(a)).forEach(a => {
      const t = visibleText(a).trim();
      if (vague.test(t)) out.push(issue('minor','Links','Potentially ambiguous link text',`“${t}” may not describe the destination when read out of context. Confirm the accessible name is specific.`,'WCAG 2.4.4',a,'review'));
    });

    [...document.querySelectorAll('table')].filter(isVisible).forEach(t => {
      if (!t.querySelector('th')) out.push(issue('moderate','Tables','Data table has no header cells detected','Use <th> with appropriate scope/header relationships for data tables.','WCAG 1.3.1',t,'review'));
      if (!t.querySelector('caption') && !t.getAttribute('aria-label') && !t.getAttribute('aria-labelledby')) out.push(issue('minor','Tables','Table has no programmatic name','Consider a <caption> or accessible label that describes the table purpose.','Table best practice',t,'review'));
    });

    const dup = new Map();
    [...document.querySelectorAll('[id]')].forEach(el => { const id = el.id; if (id) dup.set(id,(dup.get(id)||[]).concat(el)); });
    dup.forEach((els,id) => { if (els.length > 1) out.push(issue('serious','Markup','Duplicate ID',`ID “${id}” appears ${els.length} times. Duplicate IDs can break labels, ARIA references, fragment navigation, and scripting.`,'Robust markup',els[1])); });

    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 3) out.push(issue('moderate','Reflow','Horizontal page overflow detected',`Document width is ${document.documentElement.scrollWidth}px while viewport width is ${document.documentElement.clientWidth}px. Verify reflow at narrow widths and 400% zoom.`,'WCAG 1.4.10'));

    if (profile === 'strict') {
      const controls = [...document.querySelectorAll('a[href],button,input:not([type="hidden"]),select,textarea,[role="button"],[tabindex]:not([tabindex="-1"])')]
        .filter(el => !el.closest(`#${APP_ID}`) && isVisible(el)).slice(0,1200);
      controls.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 24) out.push(issue('minor','Touch targets','Small interaction target',`${Math.round(r.width)}×${Math.round(r.height)} CSS px. WCAG 2.2 target-size rules include spacing and other exceptions, so review this control in context.`,'WCAG 2.5.8 (2.2 AA)',el,'review'));
      });
    }

    return out;
  }

  function summarizeAxe(results) {
    const v = results?.violations || [];
    const byImpact = { critical:0, serious:0, moderate:0, minor:0, unknown:0 };
    v.forEach(x => byImpact[x.impact || 'unknown'] = (byImpact[x.impact || 'unknown'] || 0) + x.nodes.length);
    return { rules:v.length, nodes:v.reduce((n,x) => n + x.nodes.length,0), incomplete:(results?.incomplete || []).reduce((n,x) => n + x.nodes.length,0), byImpact };
  }

  async function runAccessibilityAudit() {
    const btn = document.querySelector(`#${APP_ID} [data-run-a11y]`);
    if (btn) btn.disabled = true;
    setStatus('Running axe + supplemental accessibility checks…');
    state.customA11y = customAccessibilityChecks(state.a11yProfile);
    try {
      if (typeof axe === 'undefined') throw new Error('axe-core did not load');
      const tags = state.a11yProfile === 'strict'
        ? ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa','best-practice']
        : ['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice'];
      const context = { include:[['body']], exclude:[[ `#${APP_ID}` ],[ `#${HILITE_ID}` ],['.wcc-annot-pin'],[ `#${LAB_ID}` ]] };
      state.axeResults = await axe.run(context, { runOnly:{ type:'tag', values:tags }, resultTypes:['violations','incomplete','passes','inapplicable'] });
      renderA11yResults();
      const sum = summarizeAxe(state.axeResults);
      setStatus(`Accessibility audit: ${sum.nodes + state.customA11y.length} flagged items; automated testing still requires manual verification.`, sum.nodes ? 'warn' : 'good');
    } catch (e) {
      console.error(e);
      state.axeResults = { violations:[], incomplete:[], passes:[], error:e.message };
      renderA11yResults();
      setStatus(`axe audit failed: ${e.message}`, 'bad');
    } finally { if (btn) btn.disabled = false; }
  }

  function axeIssuesFlat() {
    if (!state.axeResults?.violations) return [];
    const out = [];
    state.axeResults.violations.forEach(rule => rule.nodes.forEach(node => {
      out.push({ severity:rule.impact || 'moderate', category:'axe-core', title:rule.help, detail:node.failureSummary || rule.description, standard:(rule.tags || []).filter(t => /^wcag|section508|best-practice/i.test(t)).join(', '), selector:(node.target || []).join(' '), helpUrl:rule.helpUrl, type:'automated' });
    }));
    return out;
  }

  function toneForSeverity(sev) {
    if (['critical','serious','broken','error'].includes(sev)) return 'bad';
    if (['moderate','warn','warning','blocked','rate-limited'].includes(sev)) return 'warn';
    if (['minor','info','review','manual'].includes(sev)) return 'info';
    return 'good';
  }

  function focusSelector(selector) {
    if (!selector) return;
    let el = null;
    try { el = document.querySelector(selector); } catch (_) {}
    if (el) { setTab('inspect'); state.selectedEl = el; renderSelected(); el.scrollIntoView({behavior:'smooth',block:'center'}); highlight(el); setStatus('Focused audited element', 'good'); }
    else setStatus('Could not resolve that selector on the current DOM', 'warn');
  }

  function renderIssueList(box, items, emptyText = 'No issues to show.') {
    if (!box) return;
    if (!items.length) { box.innerHTML = `<div class="wcc-empty">${esc(emptyText)}</div>`; return; }
    box.innerHTML = `<div class="wcc-result-list">${items.slice(0,260).map((x,i) => `
      <div class="wcc-result">
        <div class="wcc-result-head"><span class="wcc-badge" data-tone="${toneForSeverity(x.severity)}">${esc(x.severity || 'info')}</span><div class="wcc-result-title">${esc(x.title)}</div></div>
        <div class="wcc-result-meta">${esc(x.category || '')}${x.standard ? ` · ${esc(x.standard)}` : ''}</div>
        <div style="margin-top:4px">${esc(x.detail || '')}</div>
        ${x.selector ? `<div class="wcc-code wcc-result-meta">${esc(x.selector)}</div><div class="wcc-result-actions"><button data-focus-issue="${i}">Focus element</button></div>` : ''}
      </div>`).join('')}</div>`;
    box.querySelectorAll('[data-focus-issue]').forEach(btn => btn.onclick = () => focusSelector(items[Number(btn.dataset.focusIssue)]?.selector));
  }

  function renderA11yResults() {
    const box = document.querySelector(`#${APP_ID} [data-a11y-results]`);
    if (!box) return;
    if (!state.axeResults) { box.innerHTML = '<div class="wcc-empty">Run the audit to populate findings.</div>'; return; }
    const sum = summarizeAxe(state.axeResults);
    const flat = [...axeIssuesFlat(), ...state.customA11y];
    const counts = {
      critical:flat.filter(x => x.severity === 'critical').length,
      serious:flat.filter(x => x.severity === 'serious').length,
      moderate:flat.filter(x => x.severity === 'moderate').length,
      review:flat.filter(x => ['minor','review','info'].includes(x.severity)).length
    };
    box.innerHTML = `
      <div class="wcc-summary"><div class="wcc-stat"><strong>${counts.critical}</strong><span>CRITICAL</span></div><div class="wcc-stat"><strong>${counts.serious}</strong><span>SERIOUS</span></div><div class="wcc-stat"><strong>${counts.moderate}</strong><span>MODERATE</span></div><div class="wcc-stat"><strong>${sum.incomplete}</strong><span>AXE REVIEW</span></div></div>
      <div data-a11y-list></div>`;
    renderIssueList(box.querySelector('[data-a11y-list]'), flat, 'No automated issues found. Manual accessibility testing is still required.');
  }

  function standardsAudit() {
    const results = [];
    const text = (document.body.innerText || '').replace(/\s+/g,' ').trim();
    const paragraphs = [...document.querySelectorAll('p')].filter(p => !p.closest(`#${APP_ID}`) && isVisible(p));
    const longParas = paragraphs.filter(p => countWords(visibleText(p)) > 120);
    const grade = readingGrade(text);
    const c = campaignSignals();
    const fonts = pageFonts(20);
    const palette = pagePalette(24);
    const perf = performanceSnapshot();
    const analytics = detectAnalytics();
    const stateSite = isCaliforniaStateSite();
    const h1 = visibleText(document.querySelector('h1'));

    results.push({ severity:c.confidence === 'unknown' ? 'manual' : 'good', category:'CA Principle 1', title:'Design for people’s needs', detail:c.confidence === 'unknown' ? 'The page’s primary user task is not obvious from CTA/content signals. Confirm the top user need and whether the page helps complete it quickly.' : `Detected likely objective: ${c.likelyObjective} (${c.confidence} confidence). Validate this against research/analytics and ensure the dominant journey supports it.`, standard:'California Design Principle 1', type:'review' });
    results.push({ severity:(longParas.length > Math.max(3, paragraphs.length * .2) || (grade != null && grade > 12)) ? 'warn' : 'good', category:'CA Principles 2 & 4', title:'Make it simple and concise', detail:`${longParas.length} paragraphs exceed 120 words; estimated Flesch-Kincaid grade ${grade == null ? 'n/a' : grade.toFixed(1)}. Treat these as heuristics: simplify around user tasks and use plain language where possible.`, standard:'California Design Principles 2, 4 + Content Design', type:'review' });

    const a11yCount = state.axeResults ? summarizeAxe(state.axeResults).nodes + state.customA11y.length : null;
    results.push({ severity:a11yCount == null ? 'manual' : a11yCount ? 'warn' : 'good', category:'CA Principle 3', title:'Prioritize accessibility', detail:a11yCount == null ? 'Run the ADA/WCAG audit, then complete keyboard, screen reader, zoom/reflow, and content-equivalence manual testing.' : `${a11yCount} automated/supplemental findings are currently flagged. Automated tools cannot establish conformance by themselves.`, standard:'California Design Principle 3 / WCAG', type:'review' });

    const hasAnalytics = Object.values(analytics).some(Boolean);
    results.push({ severity:hasAnalytics ? 'good' : 'manual', category:'CA Principle 5', title:'Design with data', detail:hasAnalytics ? `Analytics implementation detected (${Object.entries(analytics).filter(([,v])=>v).map(([k])=>k).join(', ')}). Confirm events measure the actual user task and conversion, not just pageviews.` : 'No common analytics implementation was detected from page markup. Confirm research, analytics, and task-success measures are informing decisions.', standard:'California Design Principle 5', type:'review' });

    results.push({ severity:'manual', category:'CA Principle 6', title:'Iterate, then iterate again', detail:'A static page inspection cannot verify the product loop. Confirm usability testing, analytics review, issue triage, and post-launch iteration are part of the workflow.', standard:'California Design Principle 6', type:'manual' });

    const consistencyWarn = fonts.length > 5 || palette.length > 16;
    results.push({ severity:consistencyWarn ? 'warn' : 'good', category:'CA Principle 7', title:'Be consistent, but not uniform', detail:`Detected ${fonts.length} prominent font-family stacks and ${palette.length} frequently used colors in the sampled DOM. Large token variation can indicate inconsistent implementation; compare components against the approved design system rather than forcing visual uniformity.`, standard:'California Design Principle 7', type:'review' });

    const perfWarn = perf.domNodes > 3000 || perf.resources > 180 || perf.transferBytes > 4_000_000 || perf.headBlockingScripts > 6;
    results.push({ severity:perfWarn ? 'warn' : 'good', category:'CA Principle 8', title:'Optimize performance', detail:`DOM ${perf.domNodes.toLocaleString()} nodes · ${perf.resources} resources · ${(perf.transferBytes/1024/1024).toFixed(2)} MB transferred (where browser timing exposes sizes) · ${perf.headBlockingScripts} blocking head scripts. Validate with Lighthouse/WebPageTest and low-end/mobile conditions.`, standard:'California Design Principle 8', type:'review' });

    results.push({ severity:'manual', category:'CA Principle 9', title:'Make things open', detail:'Confirm reusable components, documentation, public information, APIs/data, and decision rationale are shared when policy, privacy, security, and licensing allow.', standard:'California Design Principle 9', type:'manual' });

    if (!h1) results.push(issue('warn','Content design','Page purpose is not expressed by a visible H1','Use a concise page-level heading that tells people where they are and what the page is for.','CA content design / WCAG 2.4.6'));
    if (h1 && h1.length > 90) results.push(issue('warn','Content design','H1 is unusually long',`The H1 is ${h1.length} characters. Confirm it is scannable, task-oriented, and concise.`,'California content principle: be concise',document.querySelector('h1'),'review'));

    if (!document.querySelector('meta[name="viewport"]')) results.push(issue('serious','Mobile UX','Missing viewport meta tag','Responsive layouts generally require an appropriate viewport declaration for mobile rendering.','Mobile-friendly design'));
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 3) results.push(issue('warn','Mobile UX','Horizontal overflow at current viewport','Use the Responsive Lab to identify the component causing overflow and verify 320–400px layouts.','Reflow / responsive design'));

    if (stateSite) {
      const allLinks = [...document.querySelectorAll('a[href]')];
      const hasCert = allLinks.some(a => /accessibility.*certification|certification.*accessibility/i.test(visibleText(a) + ' ' + a.href));
      const hasPrivacy = allLinks.some(a => /privacy/i.test(visibleText(a)));
      const hasConditions = allLinks.some(a => /conditions of use|terms of use/i.test(visibleText(a)));
      const hasSitemap = allLinks.some(a => /sitemap/i.test(visibleText(a)));
      const caBrand = [...document.querySelectorAll('img,svg,a,span')].find(el => /ca\.gov/i.test((el.getAttribute?.('src') || '') + ' ' + (el.getAttribute?.('alt') || '') + ' ' + (el.className?.baseVal || el.className || '') + ' ' + visibleText(el)));
      results.push({ severity:hasCert ? 'good' : 'warn', category:'California state-specific', title:'Accessibility certification link', detail:hasCert ? 'Accessibility certification link detected.' : 'No obvious accessibility certification link detected. State entities should verify AB 434 / current certification requirements and placement.', standard:'California state accessibility policy', type:'review' });
      results.push({ severity:hasPrivacy && hasConditions && hasSitemap ? 'good' : 'warn', category:'California state-specific', title:'Standard footer policy links', detail:`Privacy ${hasPrivacy?'✓':'—'} · Conditions ${hasConditions?'✓':'—'} · Sitemap ${hasSitemap?'✓':'—'}. Confirm current State Web Template/footer requirements.`, standard:'CA State Web Template / Web Standards', type:'review' });
      results.push({ severity:caBrand ? 'good' : 'warn', category:'California state-specific', title:'CA.gov branding', detail:caBrand ? 'CA.gov branding signal detected. Confirm official asset, clearspace, color variant, and minimum sizing against current branding guidance.' : 'No obvious CA.gov brand mark detected. Confirm whether this site is required to implement current CA.gov branding.', standard:'CA.gov branding guidance', type:'review' });
      if (location.pathname === '/' || location.pathname === '') {
        const voter = allLinks.some(a => /register.*vote|voter registration/i.test(visibleText(a) + ' ' + a.href));
        results.push({ severity:voter ? 'good' : 'warn', category:'California state-specific', title:'Voter registration homepage link', detail:voter ? 'A voter-registration link was detected on the homepage.' : 'No obvious voter-registration link was detected on the homepage. Verify applicability of the California state-site voter registration requirement.', standard:'California SB 44 / Elections Code §2198', type:'review' });
      }
    }

    state.standardsResults = results;
    return results;
  }

  function engineeringAudit() {
    const out = [];
    const perf = performanceSnapshot();
    const stateSite = isCaliforniaStateSite();
    const allLinks = [...document.querySelectorAll('a[href]')].filter(a => !a.closest(`#${APP_ID}`));

    // SEO / discoverability
    const title = document.title.trim();
    const desc = document.querySelector('meta[name="description"]')?.content?.trim() || '';
    const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
    if (!title) out.push(issue('serious','SEO','Missing title element','Add a unique descriptive title.','SEO + WCAG 2.4.2'));
    else if (title.length > 65) out.push(issue('info','SEO','Long document title',`${title.length} characters. Search snippets vary, but verify the important differentiator appears early.`,'SEO heuristic'));
    if (!desc) out.push(issue('info','SEO','Missing meta description','Consider a concise search/social description for public-facing pages.','SEO best practice'));
    if (!canonical) out.push(issue('info','SEO','No canonical URL detected','Confirm whether a canonical link is appropriate for duplicate/parameterized URL handling.','SEO best practice'));
    if (!document.querySelector('meta[property="og:title"]')) out.push(issue('info','Social metadata','No Open Graph title detected','Add Open Graph metadata if the page is expected to be shared socially.','Social sharing best practice'));

    // Semantics/content
    const buttonsWithoutType = [...document.querySelectorAll('form button:not([type])')];
    buttonsWithoutType.forEach(b => out.push(issue('info','Forms','Button in form has implicit submit behavior','Set type="button" for non-submit controls to avoid accidental form submission.','HTML best practice',b)));
    [...document.querySelectorAll('input,select,textarea')].filter(el => !el.closest(`#${APP_ID}`)).forEach(el => {
      const type = (el.type || '').toLowerCase();
      if (['hidden','submit','button','reset','image'].includes(type)) return;
      if (/email|tel|name|address|postal|zip|username|password|cc-|birth/i.test(`${el.name} ${el.id} ${type}`) && !el.autocomplete) out.push(issue('info','Forms','Potential missing autocomplete token','For common personal-information fields, use valid autocomplete tokens when appropriate to reduce input burden.','WCAG 1.3.5 / UX',el,'review'));
    });

    // Performance
    if (perf.domNodes > 3000) out.push(issue('warn','Performance','Large DOM',`${perf.domNodes.toLocaleString()} DOM nodes detected. Large DOMs can increase style/layout and interaction cost.`,'Performance heuristic'));
    if (perf.headBlockingScripts > 6) out.push(issue('warn','Performance','Many parser-blocking head scripts',`${perf.headBlockingScripts} external head scripts lack async/defer/module.`,'Performance heuristic'));
    if (perf.imagesMissingDimensions > 5) out.push(issue('warn','Performance','Images missing intrinsic dimensions',`${perf.imagesMissingDimensions} images lack width/height attributes. Reserve image space to reduce layout shift where practical.`,'Core Web Vitals best practice'));
    if (perf.belowFoldImagesNotLazy > 8) out.push(issue('info','Performance','Many below-fold images are not lazy-loaded',`${perf.belowFoldImagesNotLazy} currently below-fold images do not use loading="lazy". Exclude hero/LCP images and validate before changing.`,'Performance heuristic'));

    // Security/privacy heuristics (not a vulnerability scanner)
    if (location.protocol !== 'https:') out.push(issue('serious','Transport','Page is not HTTPS','Serve production public sites over HTTPS and redirect HTTP traffic.','Transport security'));
    const mixed = performance.getEntriesByType('resource').filter(r => /^http:\/\//i.test(r.name));
    if (location.protocol === 'https:' && mixed.length) out.push(issue('serious','Transport','Potential mixed-content resources',`${mixed.length} HTTP resource URLs appear in Resource Timing. Review browser console and network panel.`,'Mixed content'));
    [...document.forms].filter(f => /^http:\/\//i.test(f.action)).forEach(f => out.push(issue('critical','Forms','Form submits over HTTP',`Form action is ${f.action}`,'Transport security',f)));
    allLinks.filter(a => a.target === '_blank' && !/\bnoopener\b/i.test(a.rel || '')).slice(0,40).forEach(a => out.push(issue('info','Links','target="_blank" without explicit noopener','Modern browsers generally protect opener in common cases, but explicit rel="noopener" documents the intent and supports older environments.','Defensive link practice',a,'review')));
    const extScripts = [...document.querySelectorAll('script[src]')].filter(s => { try { return new URL(s.src,location.href).origin !== location.origin; } catch (_) { return false; } });
    const noSRI = extScripts.filter(s => !s.integrity);
    if (noSRI.length > 5) out.push(issue('info','Supply chain','Third-party scripts without SRI',`${noSRI.length} cross-origin scripts do not declare integrity. SRI is not applicable to every dynamically versioned resource, but review critical third-party dependencies.`,'Security best practice',null,'review'));

    // Government / trust / search signals
    const hasSearch = !!document.querySelector('form[role="search"],input[type="search"],[aria-label*="search" i]');
    out.push({ severity:hasSearch ? 'good' : 'info', category:'Findability', title:'Site search', detail:hasSearch ? 'A search interface was detected on this page.' : 'No search interface was detected. For large public-service sites, verify that navigation and search together support findability.', standard:stateSite ? 'California web standards / findability' : 'Information architecture best practice', type:'review' });

    state.engineeringResults = out;
    return out;
  }

  function renderStandardsResults() {
    const box = document.querySelector(`#${APP_ID} [data-standards-results]`);
    if (!box) return;
    if (!state.standardsResults.length && !state.engineeringResults.length) { box.innerHTML = '<div class="wcc-empty">Run the standards audit for California design-principle, content, performance, engineering, and state-specific checks.</div>'; return; }
    const items = [...state.standardsResults, ...state.engineeringResults];
    const flagged = items.filter(x => ['warn','serious','critical'].includes(x.severity)).length;
    const manual = items.filter(x => ['manual','info'].includes(x.severity)).length;
    box.innerHTML = `<div class="wcc-summary"><div class="wcc-stat"><strong>${items.length}</strong><span>CHECKS</span></div><div class="wcc-stat"><strong>${flagged}</strong><span>FLAGGED</span></div><div class="wcc-stat"><strong>${manual}</strong><span>REVIEW</span></div><div class="wcc-stat"><strong>${isCaliforniaStateSite()?'YES':'NO'}</strong><span>*.CA.GOV</span></div></div><div data-standards-list></div>`;
    renderIssueList(box.querySelector('[data-standards-list]'), items);
  }

  async function runStandardsAudit() {
    setStatus('Running California design + engineering heuristics…');
    standardsAudit();
    engineeringAudit();
    renderStandardsResults();
    setStatus('Standards/engineering audit complete. Review manual items before treating the page as compliant.', 'good');
  }

  async function runFullAudit() {
    const btn = document.querySelector(`#${APP_ID} [data-run-all]`);
    if (btn) btn.disabled = true;
    setStatus('Running full audit suite…');
    try {
      await runAccessibilityAudit();
      await runStandardsAudit();
      setStatus('Full audit complete — accessibility, California design standards, content, performance, SEO, forms, and security heuristics.', 'good');
    } finally { if (btn) btn.disabled = false; }
  }

  function applyVisualTest(kind) {
    document.documentElement.classList.remove('wcc-grayscale');
    document.getElementById(TEST_STYLE_ID)?.remove();
    if (state.visualTest === kind) { state.visualTest = null; syncVisualButtons(); setStatus('Visual stress test off'); return; }
    state.visualTest = kind;
    if (kind === 'grayscale') document.documentElement.classList.add('wcc-grayscale');
    else {
      const s = document.createElement('style'); s.id = TEST_STYLE_ID;
      if (kind === 'spacing') s.textContent = `body *:not(#${APP_ID}):not(#${APP_ID} *) { line-height:1.5 !important; letter-spacing:.12em !important; word-spacing:.16em !important; } body p:not(#${APP_ID} *) { margin-bottom:2em !important; }`;
      if (kind === 'reduced-motion') s.textContent = `body *:not(#${APP_ID}):not(#${APP_ID} *) { animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important; scroll-behavior:auto !important; }`;
      document.documentElement.appendChild(s);
    }
    syncVisualButtons();
    setStatus(`${kind === 'spacing' ? 'WCAG text-spacing' : kind === 'grayscale' ? 'Grayscale/color-dependence' : 'Reduced-motion'} stress test enabled`, 'warn');
  }

  function syncVisualButtons() {
    const root = document.getElementById(APP_ID); if (!root) return;
    root.querySelectorAll('[data-visual-test]').forEach(b => b.setAttribute('aria-pressed', String(state.visualTest === b.dataset.visualTest)));
  }

  function normalizeLink(a) {
    const raw = a.getAttribute('href') || '';
    if (!raw) return { kind:'empty', raw };
    if (raw.startsWith('#')) return { kind:'fragment', raw, url:location.href.split('#')[0] + raw };
    if (/^(mailto:|tel:|sms:|javascript:|data:|blob:)/i.test(raw)) return { kind:'scheme', raw };
    try {
      const u = new URL(raw, location.href);
      if (!/^https?:$/.test(u.protocol)) return { kind:'scheme', raw };
      u.hash = '';
      return { kind:'http', raw, url:u.href };
    } catch (_) { return { kind:'invalid', raw }; }
  }

  function collectLinks() {
    const anchors = [...document.querySelectorAll('a[href]')].filter(a => !a.closest(`#${APP_ID}`));
    const map = new Map();
    const localIssues = [];
    anchors.forEach(a => {
      const n = normalizeLink(a);
      if (n.kind === 'fragment') {
        const id = decodeURIComponent((n.raw.slice(1) || '').replace(/\\/g,''));
        if (id && !document.getElementById(id) && !document.querySelector(`[name="${CSS.escape(id)}"]`)) localIssues.push({ url:n.raw, text:visibleText(a), status:0, classification:'broken', detail:'Fragment target not found', selector:cssSelector(a), internal:true });
        return;
      }
      if (n.kind === 'empty' || n.kind === 'invalid') localIssues.push({ url:n.raw || '(empty)', text:visibleText(a), status:0, classification:'broken', detail:n.kind === 'empty' ? 'Empty href' : 'Invalid URL', selector:cssSelector(a), internal:true });
      if (n.kind !== 'http') return;
      if (!map.has(n.url)) map.set(n.url, { url:n.url, texts:[], selectors:[], internal:new URL(n.url).origin === location.origin });
      const item = map.get(n.url); item.texts.push(visibleText(a)); item.selectors.push(cssSelector(a));
    });
    return { http:[...map.values()], localIssues };
  }

  function requestLink(url, method = 'HEAD') {
    return new Promise(resolve => {
      GM_xmlhttpRequest({
        method, url, timeout:15000, redirect:'follow', headers:method === 'GET' ? { Range:'bytes=0-0' } : {},
        onload:r => resolve({ status:r.status, finalUrl:r.finalUrl || url, headers:r.responseHeaders || '', method }),
        onerror:() => resolve({ status:0, finalUrl:url, error:'network error', method }),
        ontimeout:() => resolve({ status:0, finalUrl:url, error:'timeout', method })
      });
    });
  }

  function classifyHttp(status) {
    if (status >= 200 && status < 400) return 'ok';
    if ([404,410].includes(status)) return 'broken';
    if ([401,403].includes(status)) return 'blocked';
    if (status === 429) return 'rate-limited';
    if (status >= 500) return 'error';
    if (status === 0) return 'unverified';
    if (status >= 400) return 'error';
    return 'unverified';
  }

  async function checkOneLink(item) {
    let res = await requestLink(item.url, 'HEAD');
    if ([0,403,405,501].includes(res.status)) {
      const fallback = await requestLink(item.url, 'GET');
      if (fallback.status && fallback.status !== 403) res = fallback;
      else if (!res.status) res = fallback;
    }
    return {
      url:item.url, text:item.texts.find(Boolean) || '', status:res.status, classification:classifyHttp(res.status),
      detail:res.error || (res.finalUrl !== item.url ? `Final: ${res.finalUrl}` : ''), selector:item.selectors[0] || '', internal:item.internal, method:res.method
    };
  }

  async function scanBrokenLinks() {
    if (state.linkScanRunning) { state.linkScanAbort = true; setStatus('Stopping link scan after current requests…', 'warn'); return; }
    state.linkScanRunning = true; state.linkScanAbort = false;
    const btn = document.querySelector(`#${APP_ID} [data-links-scan]`);
    if (btn) btn.textContent = 'Stop scan';
    const { http, localIssues } = collectLinks();
    state.linkResults = [...localIssues];
    const max = Math.min(http.length, 300);
    const queue = http.slice(0,max);
    let done = 0;
    const progress = document.querySelector(`#${APP_ID} [data-link-progress] > span`);
    setStatus(`Checking ${max} unique HTTP(S) links…`);

    async function worker() {
      while (queue.length && !state.linkScanAbort) {
        const item = queue.shift();
        const r = await checkOneLink(item);
        state.linkResults.push(r); done++;
        if (progress) progress.style.width = `${Math.round((done/max)*100)}%`;
        if (done % 4 === 0 || done === max) renderLinkResults();
      }
    }
    await Promise.all(Array.from({length:Math.min(6,max || 1)}, worker));
    state.linkScanRunning = false;
    if (btn) btn.textContent = 'Scan links';
    renderLinkResults();
    const broken = state.linkResults.filter(x => ['broken','error'].includes(x.classification)).length;
    const unverified = state.linkResults.filter(x => ['blocked','rate-limited','unverified'].includes(x.classification)).length;
    setStatus(`${state.linkScanAbort ? 'Link scan stopped.' : 'Link scan complete.'} ${broken} broken/error; ${unverified} blocked or unverified.`, broken ? 'warn' : 'good');
  }

  function renderLinkResults() {
    const box = document.querySelector(`#${APP_ID} [data-link-results]`);
    if (!box) return;
    const items = state.linkResults;
    if (!items.length) { box.innerHTML = '<div class="wcc-empty">Run the link scan. Fragment targets are checked locally; HTTP(S) URLs are checked on demand.</div>'; return; }
    const counts = {
      broken:items.filter(x => ['broken','error'].includes(x.classification)).length,
      ok:items.filter(x => x.classification === 'ok').length,
      blocked:items.filter(x => ['blocked','rate-limited','unverified'].includes(x.classification)).length,
      total:items.length
    };
    const ordered = [...items].sort((a,b) => {
      const rank = {broken:0,error:0,blocked:1,'rate-limited':1,unverified:2,ok:3};
      return (rank[a.classification] ?? 2) - (rank[b.classification] ?? 2);
    });
    box.innerHTML = `<div class="wcc-summary"><div class="wcc-stat"><strong>${counts.broken}</strong><span>BROKEN</span></div><div class="wcc-stat"><strong>${counts.blocked}</strong><span>UNVERIFIED</span></div><div class="wcc-stat"><strong>${counts.ok}</strong><span>OK</span></div><div class="wcc-stat"><strong>${counts.total}</strong><span>CHECKED</span></div></div><div class="wcc-result-list">${ordered.slice(0,300).map((x,i) => `
      <div class="wcc-result"><div class="wcc-result-head"><span class="wcc-badge" data-tone="${toneForSeverity(x.classification)}">${esc(x.status || x.classification)}</span><div class="wcc-result-title">${esc(x.text || x.url)}</div></div><div class="wcc-result-meta">${esc(x.classification)} · ${x.internal ? 'internal' : 'external'}</div><div class="wcc-code" style="margin-top:4px;overflow-wrap:anywhere">${esc(x.url)}</div>${x.detail ? `<div class="wcc-result-meta">${esc(x.detail)}</div>` : ''}${x.selector ? `<div class="wcc-result-actions"><button data-link-focus="${i}">Focus link</button></div>` : ''}</div>`).join('')}</div>`;
    box.querySelectorAll('[data-link-focus]').forEach(btn => btn.onclick = () => focusSelector(ordered[Number(btn.dataset.linkFocus)]?.selector));
  }

  function openResponsiveLab() {
    if (document.getElementById(LAB_ID)) return;

    const lab = document.createElement('div');
    lab.id = LAB_ID;
    lab.innerHTML = `
      <div class="wcc-labbar">
        <div class="wcc-labtitle">Responsive Lab — managed side-by-side viewports</div>
        <div class="wcc-labcontrols">
          <select data-lab-preset aria-label="Device preset">
            ${DEVICE_PRESETS.map(d => `<option value="${esc(d.preset)}">${esc(d.name)} — ${d.w}×${d.h}</option>`).join('')}
            <option value="custom">Custom size…</option>
          </select>
          <button data-lab-add>Add device</button>
          <button data-lab-reset title="Restore the default iPhone + iPad layout">Reset</button>
          <button data-lab-reload>Reload all</button>
          <button data-lab-sync aria-pressed="false">Sync scroll: off</button>
          <button data-lab-close>Close</button>
        </div>
        <div class="wcc-labnote">Starts with iPhone + iPad. Add, remove, rotate, or create custom CSS viewports at any time. The iframe keeps the exact labeled CSS viewport and is only visually scaled to fit its panel. Sites that deny framing may appear blank.</div>
      </div>
      <div class="wcc-devices" data-lab-devices></div>`;
    document.documentElement.appendChild(lab);

    const devicesBox = lab.querySelector('[data-lab-devices]');
    let resizeObserver = null;
    let syncingScroll = false;

    const persistDevices = () => GM_setValue(STORAGE.responsiveDevices, state.responsiveDevices);

    const fitDevice = section => {
      const id = section?.dataset.deviceId;
      const device = state.responsiveDevices.find(d => d.id === id);
      if (!device) return;
      const viewport = section.querySelector('.wcc-deviceviewport');
      const wrap = section.querySelector('.wcc-devicewrap');
      const frame = section.querySelector('iframe');
      const meta = section.querySelector('.wcc-devicemeta');
      if (!viewport || !wrap || !frame) return;

      const usableW = Math.max(220, viewport.clientWidth - 24);
      const usableH = Math.max(300, viewport.clientHeight - 24);
      const scale = Math.max(.2, Math.min(1, usableW / device.w, usableH / device.h));
      const renderedW = Math.max(1, Math.round(device.w * scale));
      const renderedH = Math.max(1, Math.round(device.h * scale));

      wrap.style.width = `${renderedW}px`;
      wrap.style.height = `${renderedH}px`;
      frame.style.width = `${device.w}px`;
      frame.style.height = `${device.h}px`;
      frame.style.transform = `scale(${scale})`;
      if (meta) meta.textContent = `${device.w}×${device.h} · ${Math.round(scale * 100)}%`;
    };

    const fitAll = () => lab.querySelectorAll('.wcc-device').forEach(fitDevice);

    const bindFrameSync = frame => {
      frame.addEventListener('load', () => {
        try {
          frame.contentWindow.addEventListener('scroll', () => {
            if (!state.responsiveSync || syncingScroll) return;
            const doc = frame.contentDocument?.documentElement;
            if (!doc) return;
            const max = Math.max(1, doc.scrollHeight - frame.contentWindow.innerHeight);
            const ratio = frame.contentWindow.scrollY / max;
            syncingScroll = true;
            lab.querySelectorAll('iframe').forEach(other => {
              if (other === frame) return;
              try {
                const odoc = other.contentDocument?.documentElement;
                if (!odoc) return;
                const omax = Math.max(0, odoc.scrollHeight - other.contentWindow.innerHeight);
                other.contentWindow.scrollTo(0, ratio * omax);
              } catch (_) {}
            });
            requestAnimationFrame(() => { syncingScroll = false; });
          }, { passive:true });
        } catch (_) {}
      });
    };

    const renderDevices = () => {
      if (!state.responsiveDevices.length) {
        devicesBox.innerHTML = '<div class="wcc-labempty">No device previews are active. Choose a preset above and select <strong>Add device</strong>.</div>';
        return;
      }

      devicesBox.innerHTML = state.responsiveDevices.map(d => `
        <section class="wcc-device" data-device-id="${esc(d.id)}">
          <div class="wcc-devicehead">
            <span class="wcc-devicename" title="${esc(d.name)}">${esc(d.name)}</span>
            <span class="wcc-devicemeta">${d.w}×${d.h}</span>
            <span class="wcc-deviceactions">
              <button data-lab-rotate="${esc(d.id)}" aria-label="Rotate ${esc(d.name)}" title="Rotate viewport">↻</button>
              <button data-lab-remove="${esc(d.id)}" aria-label="Remove ${esc(d.name)}" title="Remove device">×</button>
            </span>
          </div>
          <div class="wcc-deviceviewport">
            <div class="wcc-devicewrap">
              <iframe data-device-frame="${esc(d.id)}" src="${esc(location.href)}" title="${esc(d.name)} responsive preview"></iframe>
            </div>
          </div>
        </section>`).join('');

      devicesBox.querySelectorAll('[data-lab-remove]').forEach(btn => {
        btn.onclick = () => {
          state.responsiveDevices = state.responsiveDevices.filter(d => d.id !== btn.dataset.labRemove);
          persistDevices();
          renderDevices();
        };
      });

      devicesBox.querySelectorAll('[data-lab-rotate]').forEach(btn => {
        btn.onclick = () => {
          const device = state.responsiveDevices.find(d => d.id === btn.dataset.labRotate);
          if (!device) return;
          [device.w, device.h] = [device.h, device.w];
          persistDevices();
          renderDevices();
        };
      });

      devicesBox.querySelectorAll('iframe').forEach(bindFrameSync);
      requestAnimationFrame(() => requestAnimationFrame(fitAll));
    };

    lab.querySelector('[data-lab-add]').onclick = () => {
      const presetId = lab.querySelector('[data-lab-preset]').value;
      let device;
      if (presetId === 'custom') {
        const name = (window.prompt('Custom device name:', 'Custom viewport') || '').trim();
        if (!name) return;
        const w = Number(window.prompt('CSS viewport width in pixels:', '1024'));
        const h = Number(window.prompt('CSS viewport height in pixels:', '768'));
        if (!Number.isFinite(w) || !Number.isFinite(h) || w < 240 || h < 320 || w > 5120 || h > 5120) {
          setStatus('Custom viewport must be between 240–5120px wide and 320–5120px high.', 'warn');
          return;
        }
        device = { preset:'custom', name, w:Math.round(w), h:Math.round(h) };
      } else {
        const preset = DEVICE_PRESETS.find(d => d.preset === presetId);
        if (!preset) return;
        device = { ...preset };
      }
      device.id = `${device.preset || 'device'}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      state.responsiveDevices.push(device);
      persistDevices();
      renderDevices();
    };

    lab.querySelector('[data-lab-reset]').onclick = () => {
      state.responsiveDevices = defaultResponsiveDevices();
      persistDevices();
      renderDevices();
    };

    lab.querySelector('[data-lab-close]').onclick = () => {
      resizeObserver?.disconnect();
      lab.remove();
    };

    lab.querySelector('[data-lab-reload]').onclick = () => lab.querySelectorAll('iframe').forEach(frame => {
      try { frame.contentWindow.location.reload(); }
      catch (_) { frame.src = frame.src; }
    });

    lab.querySelector('[data-lab-sync]').onclick = e => {
      state.responsiveSync = !state.responsiveSync;
      e.currentTarget.setAttribute('aria-pressed', String(state.responsiveSync));
      e.currentTarget.textContent = `Sync scroll: ${state.responsiveSync ? 'on' : 'off'}`;
    };

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(() => fitAll());
      resizeObserver.observe(devicesBox);
    } else {
      window.addEventListener('resize', fitAll, { passive:true, once:true });
    }

    renderDevices();
  }

  async function eyedropper() {
    if ('EyeDropper' in window) {
      try { const res = await new EyeDropper().open(); copy(res.sRGBHex, `Color ${res.sRGBHex} copied`); }
      catch (_) { setStatus('Eyedropper cancelled'); }
      return;
    }
    setStatus('Native EyeDropper is unavailable in this browser. Inspect an element to read computed colors.', 'warn');
  }

  async function screenshotFullPage() {
    const root = document.getElementById(APP_ID);
    const old = root.style.display; root.style.display = 'none'; clearHighlight();
    setStatus('Rendering full-page PNG…');
    try {
      const canvas = await html2canvas(document.documentElement, {
        useCORS:true, allowTaint:false, scale:Math.min(2,devicePixelRatio || 1), width:document.documentElement.scrollWidth,
        height:document.documentElement.scrollHeight, windowWidth:document.documentElement.scrollWidth, windowHeight:document.documentElement.scrollHeight,
        scrollX:0, scrollY:0, backgroundColor:getComputedStyle(document.body).backgroundColor || '#ffffff'
      });
      const a = document.createElement('a'); a.download = `${slugify(location.hostname + '-' + document.title)}.png`; a.href = canvas.toDataURL('image/png'); a.click();
      setStatus('Full-page PNG saved', 'good');
    } catch (e) { console.error(e); setStatus('PNG capture failed; cross-origin/canvas restrictions may block some assets.', 'bad'); }
    finally { root.style.display = old; }
  }

  function toggleInspect(on = !state.inspectMode) { state.inspectMode = on; if (on) state.annotateMode = false; syncButtons(); setStatus(on ? 'Inspect mode: hover and click an element' : 'Inspect mode off'); }
  function toggleAnnotate(on = !state.annotateMode) { state.annotateMode = on; if (on) state.inspectMode = false; syncButtons(); setStatus(on ? 'Annotate mode: click an element to add a change request' : 'Annotate mode off'); }
  function toggleOutline() { state.outlineMode = !state.outlineMode; document.documentElement.classList.toggle('wcc-outline-all',state.outlineMode); syncButtons(); setStatus(state.outlineMode ? 'Outlined page elements' : 'Outline off'); }
  function toggleEdit() { state.editMode = !state.editMode; document.body.contentEditable = state.editMode ? 'true' : 'false'; document.getElementById(APP_ID)?.setAttribute('contenteditable','false'); syncButtons(); setStatus(state.editMode ? 'Temporary page editing enabled — rendered DOM only' : 'Temporary editing disabled', state.editMode ? 'warn' : ''); }

  function syncButtons() {
    const root = document.getElementById(APP_ID); if (!root) return;
    const m = { inspect:state.inspectMode, annotate:state.annotateMode, outline:state.outlineMode, edit:state.editMode };
    Object.entries(m).forEach(([k,v]) => root.querySelector(`[data-mode="${k}"]`)?.setAttribute('aria-pressed',String(v)));
    syncVisualButtons();
  }

  function onMove(e) {
    if (!state.inspectMode && !state.annotateMode) return;
    const el = e.target;
    if (el.closest?.(`#${APP_ID}`) || el.closest?.(`#${LAB_ID}`) || el.classList?.contains('wcc-annot-pin')) return clearHighlight();
    highlight(el);
  }

  function onClick(e) {
    if (!state.inspectMode && !state.annotateMode) return;
    const el = e.target;
    if (el.closest?.(`#${APP_ID}`) || el.closest?.(`#${LAB_ID}`) || el.classList?.contains('wcc-annot-pin')) return;
    e.preventDefault(); e.stopPropagation();
    if (state.inspectMode) { state.selectedEl = el; renderSelected(); setStatus('Element selected', 'good'); }
    if (state.annotateMode) addNote(el);
  }

  function auditExportObject() {
    return {
      generatedAt:new Date().toISOString(), url:location.href, title:document.title, pageSnapshot:developerSnapshot(), notes:state.notes,
      accessibility:{ axeSummary:state.axeResults ? summarizeAxe(state.axeResults) : null, axeIssues:axeIssuesFlat(), supplemental:state.customA11y },
      californiaStandards:state.standardsResults, engineering:state.engineeringResults, linkResults:state.linkResults
    };
  }

  function exportMarkdown() {
    const a = auditExportObject();
    const lines = [`# Website Audit & Review`, '', `- URL: ${a.url}`, `- Page title: ${a.title}`, `- Created: ${a.generatedAt}`, `- Viewport: ${innerWidth} × ${innerHeight}`, ''];
    lines.push('## Accessibility', '');
    if (a.accessibility.axeSummary) lines.push(`- axe violations: ${a.accessibility.axeSummary.nodes} affected nodes across ${a.accessibility.axeSummary.rules} rules`, `- axe items requiring review: ${a.accessibility.axeSummary.incomplete}`, `- Supplemental checks: ${a.accessibility.supplemental.length}`, '');
    else lines.push('_Accessibility audit has not been run._', '');
    [...a.accessibility.axeIssues, ...a.accessibility.supplemental].slice(0,200).forEach((x,i) => lines.push(`### A${i+1}. ${x.title}`, `- Severity: ${x.severity}`, x.standard ? `- Standard: ${x.standard}` : '', x.selector ? `- Selector: \`${x.selector}\`` : '', `- ${x.detail}`, ''));
    lines.push('## California Design Standards & Engineering', '');
    [...a.californiaStandards, ...a.engineering].forEach((x,i) => lines.push(`### S${i+1}. ${x.title}`, `- Status: ${x.severity}`, `- Area: ${x.category}`, x.standard ? `- Standard: ${x.standard}` : '', x.selector ? `- Selector: \`${x.selector}\`` : '', `- ${x.detail}`, ''));
    lines.push('## Broken / Unverified Links', '');
    const links = a.linkResults.filter(x => x.classification !== 'ok');
    if (!links.length) lines.push('_No non-OK link results recorded (or the scanner has not been run)._','');
    links.forEach((x,i) => lines.push(`### L${i+1}. ${x.text || x.url}`, `- ${x.classification}${x.status ? ` (${x.status})` : ''}`, `- URL: ${x.url}`, x.detail ? `- ${x.detail}` : '', ''));
    lines.push('## Requested Changes', '');
    if (!a.notes.length) lines.push('_No annotations._');
    a.notes.forEach((n,i) => lines.push(`### ${i+1}. ${n.comment}`, '', `- Selector: \`${n.selector}\``, `- XPath: \`${n.xpath}\``, n.text ? `- Current text: “${n.text}”` : '', ''));
    return lines.filter(x => x !== '').join('\n').replace(/\n{3,}/g,'\n\n');
  }

  function setTab(name) {
    state.activeTab = name; GM_setValue(STORAGE.activeTab,name);
    const root = document.getElementById(APP_ID); if (!root) return;
    root.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected',String(b.dataset.tab === name)));
    root.querySelectorAll('[data-panel]').forEach(p => p.dataset.active = String(p.dataset.panel === name));
  }

  function createUI() {
    const root = document.createElement('div'); root.id = APP_ID;
    root.innerHTML = `
      <div class="wcc-shell">
        <div class="wcc-head"><div class="wcc-title">WebDev Command Center <span class="wcc-version">v0.5.0</span></div><button class="wcc-iconbtn" data-collapse aria-label="Collapse or expand">${state.panelOpen ? '−' : '+'}</button></div>
        <div class="${state.panelOpen ? '' : 'wcc-hidden'}" data-bodywrap>
          <div class="wcc-tabs" role="tablist">
            <button data-tab="inspect">Inspect</button><button data-tab="audit">Audit</button><button data-tab="links">Links</button><button data-tab="responsive">Devices</button><button data-tab="review">Review</button><button data-tab="campaign">Campaign</button>
          </div>
          <div class="wcc-body">
            <div class="wcc-panel" data-panel="inspect">
              <div class="wcc-section"><div class="wcc-label">Inspect & Visual QA</div><div class="wcc-grid3"><button data-mode="inspect">Inspect</button><button data-eyedropper>Dropper</button><button data-mode="outline">Outline</button><button data-mode="edit">Edit text</button><button data-visual-test="grayscale">Grayscale</button><button data-visual-test="reduced-motion">No motion</button></div></div>
              <div class="wcc-section"><div class="wcc-label">Selected Element</div><div class="wcc-info" data-selected><div class="wcc-empty">Inspect an element to see computed details.</div></div></div>
              <div class="wcc-section"><div class="wcc-label">Stress Tests</div><div class="wcc-grid"><button data-visual-test="spacing">WCAG text spacing</button><button data-copy-snapshot>Copy page snapshot</button></div><div class="wcc-help">Stress tests intentionally alter presentation only in your browser. Toggle the same button to restore.</div></div>
              <div class="wcc-section"><div class="wcc-label">Capture</div><div class="wcc-grid"><button data-png>Full-page PNG</button><button data-print>Print / PDF</button></div></div>
            </div>

            <div class="wcc-panel" data-panel="audit">
              <div class="wcc-section"><div class="wcc-label">Audit Profile</div><select class="wcc-input" data-a11y-profile><option value="title2">ADA Title II / WCAG 2.1 AA baseline</option><option value="strict">WCAG 2.2 AA + CA forward-looking review</option></select><div class="wcc-help">The Title II profile targets the U.S. state/local-government technical baseline. Strict adds WCAG 2.2 AA checks and extra review heuristics.</div></div>
              <div class="wcc-section"><div class="wcc-label">Run Audits</div><div class="wcc-grid3"><button data-run-all>Audit all</button><button data-run-a11y>ADA/WCAG</button><button data-run-standards>CA + Eng.</button></div></div>
              <div class="wcc-section"><div class="wcc-label">Accessibility Findings</div><div data-a11y-results><div class="wcc-empty">Run the audit to populate findings.</div></div></div>
              <div class="wcc-section"><div class="wcc-label">California Standards + Engineering</div><div data-standards-results><div class="wcc-empty">Run the standards audit for design-principle, content, performance, and engineering feedback.</div></div></div>
              <div class="wcc-section"><div class="wcc-grid"><button data-copy-audit>Copy audit Markdown</button><button data-export-audit>Export audit JSON</button></div></div>
            </div>

            <div class="wcc-panel" data-panel="links">
              <div class="wcc-section"><div class="wcc-label">Broken Link Identifier</div><button style="width:100%" data-links-scan>Scan links</button><div class="wcc-progress" data-link-progress><span></span></div><div class="wcc-help">Checks same-page fragments locally and up to 300 unique HTTP(S) URLs with 6 concurrent requests. 401/403/429/timeouts are marked unverified rather than falsely called broken.</div></div>
              <div class="wcc-section"><div data-link-results><div class="wcc-empty">Run the link scan. Nothing is checked in the background.</div></div></div>
            </div>

            <div class="wcc-panel" data-panel="responsive">
              <div class="wcc-section"><div class="wcc-label">Responsive Device Lab</div><button style="width:100%" data-responsive>Open side-by-side lab</button><div class="wcc-help">Starts with iPhone (390×844) and iPad (768×1024) side by side. Add/remove preset or custom devices, rotate individual previews, and optionally synchronize vertical scrolling.</div></div>
              <div class="wcc-section"><div class="wcc-label">Current Viewport</div><div class="wcc-info wcc-kv"><div class="wcc-k">Viewport</div><div>${innerWidth} × ${innerHeight}</div><div class="wcc-k">DPR</div><div>${devicePixelRatio || 1}</div><div class="wcc-k">Document</div><div>${document.documentElement.scrollWidth} × ${document.documentElement.scrollHeight}</div></div></div>
            </div>

            <div class="wcc-panel" data-panel="review">
              <div class="wcc-section">
                <div class="wcc-label">Visual Change Review</div>
                <div class="wcc-review-summary" data-review-summary><strong>0 open</strong><span>0 total changes</span></div>
                <button class="wcc-review-primary" style="width:100%;margin-bottom:8px" data-mode="annotate">＋ Add change from page</button>
                <div data-notes></div>
                <div class="wcc-review-actions">
                  <button class="wcc-wide" data-copy-review>Copy for Teams</button>
                  <button data-copy-visual>Copy visual board</button>
                  <button data-json>Export review JSON</button>
                  <button class="wcc-wide" data-clear-notes>Clear review</button>
                </div>
                <div class="wcc-help">Each change stores a small visual clip, your note, current text, and developer selector. “Copy for Teams” creates clean rich text; “Copy visual board” puts a shareable PNG on your clipboard when the browser allows it.</div>
              </div>
            </div>

            <div class="wcc-panel" data-panel="campaign">
              <div class="wcc-section"><div class="wcc-label">Campaign Intelligence</div><div data-campaign></div><div style="margin-top:8px"><button style="width:100%" data-research>Search design inspiration</button></div><div class="wcc-help">Campaign intent is estimated locally from page copy, calls to action, forms, and visible content. Inspiration searches open normal Google search tabs; the campaign estimate runs entirely in the page.</div></div>
              <div class="wcc-section"><div class="wcc-label">Campaign Review Snapshot</div><div class="wcc-info"><div class="wcc-help" style="margin-top:0">Use the detected objective as a starting point for manual review of audience, conversion path, CTA hierarchy, trust signals, content sequence, and mobile experience.</div></div></div>
            </div>
          </div>
        </div>
        <div class="wcc-status">Ready</div>
      </div>`;
    document.documentElement.appendChild(root);

    root.querySelector('[data-collapse]').onclick = () => {
      state.panelOpen = !state.panelOpen; GM_setValue(STORAGE.panelOpen,state.panelOpen);
      root.querySelector('[data-bodywrap]').classList.toggle('wcc-hidden',!state.panelOpen);
      root.querySelector('[data-collapse]').textContent = state.panelOpen ? '−' : '+';
    };
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
    root.querySelector('[data-mode="inspect"]').onclick = () => toggleInspect();
    root.querySelector('[data-mode="annotate"]').onclick = () => toggleAnnotate();
    root.querySelector('[data-mode="outline"]').onclick = toggleOutline;
    root.querySelector('[data-mode="edit"]').onclick = toggleEdit;
    root.querySelector('[data-eyedropper]').onclick = eyedropper;
    root.querySelectorAll('[data-visual-test]').forEach(b => b.onclick = () => applyVisualTest(b.dataset.visualTest));
    root.querySelector('[data-png]').onclick = screenshotFullPage;
    root.querySelector('[data-print]').onclick = () => { const d = root.style.display; root.style.display = 'none'; setTimeout(() => { window.print(); root.style.display = d; },50); };
    root.querySelector('[data-copy-snapshot]').onclick = () => copy(JSON.stringify(developerSnapshot(),null,2),'Page snapshot copied');
    root.querySelector('[data-run-a11y]').onclick = runAccessibilityAudit;
    root.querySelector('[data-run-standards]').onclick = runStandardsAudit;
    root.querySelector('[data-run-all]').onclick = runFullAudit;
    root.querySelector('[data-a11y-profile]').value = state.a11yProfile;
    root.querySelector('[data-a11y-profile]').onchange = e => { state.a11yProfile = e.target.value; GM_setValue(STORAGE.a11yProfile,state.a11yProfile); setStatus('Accessibility audit profile saved','good'); };
    root.querySelector('[data-copy-audit]').onclick = () => copy(exportMarkdown(),'Audit Markdown copied');
    root.querySelector('[data-export-audit]').onclick = () => downloadText(`${slugify(location.hostname+'-'+document.title)}-audit.json`,JSON.stringify(auditExportObject(),null,2),'application/json');
    root.querySelector('[data-links-scan]').onclick = scanBrokenLinks;
    root.querySelector('[data-responsive]').onclick = openResponsiveLab;
    root.querySelector('[data-copy-review]').onclick = copyForTeams;
    root.querySelector('[data-copy-visual]').onclick = copyVisualBoard;
    root.querySelector('[data-json]').onclick = () => downloadText(`${slugify(location.hostname+'-'+document.title)}-review.json`,JSON.stringify({ generatedAt:new Date().toISOString(), url:location.href, title:document.title, changes:state.notes },null,2),'application/json');
    root.querySelector('[data-clear-notes]').onclick = () => { if (confirm('Clear all annotations for this page?')) { state.notes = []; persistNotes(); setStatus('Annotations cleared'); } };
    root.querySelector('[data-research]').onclick = openResearchTabs;

    renderSelected(); renderNotes(); renderCampaign(); renderA11yResults(); renderStandardsResults(); renderLinkResults(); syncButtons(); setTab(state.activeTab);
  }

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    GM_registerMenuCommand('Toggle WebDev Command Center', () => { const root = document.getElementById(APP_ID); if (root) root.style.display = root.style.display === 'none' ? '' : 'none'; });
    GM_registerMenuCommand('Run full WebDev audit', () => { setTab('audit'); runFullAudit(); });
    GM_registerMenuCommand('Open Responsive Lab', openResponsiveLab);
    GM_registerMenuCommand('Clear WebDev annotations', () => { state.notes = []; persistNotes(); });
  }

  function init() {
    if (document.getElementById(APP_ID)) return;
    addStyle(); createUI(); renderPins(); registerMenu(); ensureHighlight();
    document.addEventListener('mousemove',onMove,true);
    document.addEventListener('click',onClick,true);
    window.addEventListener('resize',() => state.selectedEl && highlight(state.selectedEl));
    window.addEventListener('scroll',() => state.selectedEl && state.inspectMode && highlight(state.selectedEl),true);
  }

  init();
})();
