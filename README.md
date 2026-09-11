# WebDev Command Center v0.5

A Tampermonkey “Swiss army knife” for senior web developers, designers, content teams, and QA reviewers. It runs directly on the page you are reviewing and combines visual inspection, accessibility auditing, California government design review, link checking, responsive comparison, capture, annotations, campaign analysis, and optional AI/web research.

**Site:** [jeremyredkey.github.io/webdev-command-center](https://jeremyredkey.github.io/webdev-command-center/)  
**Install:** [Add to Tampermonkey](https://jeremyredkey.github.io/webdev-command-center/webdev-command-center.user.js)

This repository contains the browser userscript and an optional local Node.js bridge. No API keys or private credentials are included.

## What is included

### Inspect & visual QA

- Element picker with CSS selector and XPath
- Computed typography, foreground/background, WCAG contrast ratio
- Box-model spacing, display/position, role and ARIA label
- Native EyeDropper when supported
- DOM outline mode
- Temporary rendered-text editing
- Grayscale/color-dependence stress test
- Reduced-motion stress test
- WCAG text-spacing stress test
- Copy compact structured page brief

### Accessibility / ADA / WCAG

The **Audit** tab has two profiles:

1. **ADA Title II / WCAG 2.1 AA baseline**
   - Intended as the technical baseline for U.S. state/local-government web content under the DOJ Title II web rule.
   - Runs axe-core WCAG 2.0/2.1 A/AA plus best-practice rules and supplemental DOM checks.

2. **WCAG 2.2 AA + CA forward-looking review**
   - Adds WCAG 2.2 A/AA rules when available in axe-core.
   - Adds target-size review and stricter senior-QA heuristics.

The script uses **axe-core 4.13.0** plus supplemental checks for items such as:

- document language and page title
- zoom restrictions
- H1 / heading hierarchy
- main landmarks
- skip-link presence
- image alt attributes
- iframe titles
- video caption/autoplay signals
- ambiguous link text
- table semantics
- duplicate IDs
- horizontal overflow/reflow
- WCAG 2.2 target-size review in strict mode

Automated testing is intentionally labeled as evidence, not proof of accessibility or legal compliance. Manual keyboard, screen-reader, zoom/reflow, media-equivalence, cognitive/usability, and real-user testing still matter.

### California Web Standards / design-principle audit

The local audit maps observable evidence and manual-review prompts to California’s nine design principles:

1. Design for people’s needs
2. Do the hard work to make it simple and great
3. Prioritize accessibility
4. Be concise
5. Design with data
6. Iterate, then iterate again
7. Be consistent, but not uniform
8. Optimize performance
9. Make things open

It also evaluates practical signals around:

- user-task / campaign clarity
- content concision and approximate reading grade
- heading/page-purpose clarity
- typography and color-system consistency heuristics
- viewport and horizontal overflow
- analytics detection
- DOM/resource weight and blocking scripts
- image sizing/lazy-loading signals
- metadata / SEO / Open Graph
- forms and autocomplete
- HTTPS / insecure form actions / mixed-content signals
- third-party scripts / SRI review
- search/findability

#### California state-only safeguards

The script detects actual `ca.gov` / `*.ca.gov` hostnames separately. Only then does it surface state-specific checks such as:

- accessibility certification link
- CA.gov branding signal
- common State Web Template footer-policy links
- voter-registration homepage link review

These state-only rules are **not** automatically treated as failures on an ordinary California city/county/private/nonprofit site.

### Broken Link Identifier

- Checks same-page `#fragment` destinations locally
- Checks up to 300 unique HTTP(S) links on demand
- Six concurrent requests
- HEAD first, limited GET fallback for servers that reject HEAD
- Separates:
  - OK
  - confirmed broken (for example 404/410)
  - server error
  - blocked/authenticated (401/403)
  - rate-limited (429)
  - timeout/network/unverified
- Internal vs external classification
- “Focus link” button jumps back to the source element

`@connect *` is required so Tampermonkey can check external URLs. The scanner only runs when you click it; there is no background crawling.

### Responsive Device Lab

A full-screen side-by-side responsive comparison with real iframe viewport widths:

- 320 px — small phone
- 390 px — common phone
- 430 px — large phone
- 768 px — tablet
- 1280 px — laptop
- 1440 px — desktop
- 1920 px — wide desktop

Features:

- all breakpoints visible in one horizontally scrollable workspace
- real media-query viewport widths inside each iframe
- reload all
- optional synchronized vertical scrolling

Sites with `X-Frame-Options: DENY` or restrictive `frame-ancestors` rules may prevent the live preview from rendering. In that case use the same listed widths in browser DevTools/device emulation.

### Capture & review communication

- Full-page PNG using html2canvas
- Browser Print / Save as PDF
- Click-to-annotate page changes
- Annotation pins on the source DOM
- CSS selector, XPath, current text, URL and timestamp stored per note
- Copy a combined Markdown audit/review
- Export JSON containing the page brief, accessibility findings, standards review, engineering review, link results, and annotations

### Campaign intelligence

Local heuristic analysis estimates whether the page is primarily trying to support:

- recruitment / hiring
- event attendance
- public service / program adoption
- public awareness / education
- lead generation
- sales / conversion
- fundraising
- signup / membership

The page brief includes headings, CTAs, body text, metadata, forms, links, palette, fonts, viewport, analytics signals, performance evidence, audit results, and annotations.

### Optional AI + live web research

`webdev-ai-bridge.mjs` keeps the OpenAI API key outside Tampermonkey. It uses the OpenAI Responses API and the `web_search` tool to:

- infer the campaign objective, audience, conversions, barriers and ideal journey
- audit the page against current California design principles and content-design guidance
- review accessibility findings against applicable WCAG/ADA guidance
- distinguish required / state-only / recommended / manual-review items
- evaluate UX, hierarchy, mobile behavior, performance, trust and conversion effectiveness
- search the live web for 5–8 comparable campaigns/examples
- explain which pattern is worth borrowing from each example
- propose three different redesign directions
- produce a P0/P1/P2 implementation backlog
- return web-search citation annotations and clickable source links in the Tampermonkey panel

The AI prompt is instructed to prefer official California, W3C and ADA.gov sources for standards claims, while treating the Madison Ave. Collective checklist as a secondary practical reference.

## Standards source set

The AI and local audit are designed around these source families:

- California Web Standards — web policies
- California Web Standards — design principles
- California Web Standards — accessibility
- CA.gov branding / State Web Template
- California Innovation Hub — content design principles
- W3C WCAG 2.2
- U.S. DOJ / ADA.gov Title II web accessibility rule
- Madison Ave. Collective California accessibility checklist (secondary reference)

The AI bridge searches these sources live rather than assuming they never change.

## Install the userscript

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Open the [install link](https://jeremyredkey.github.io/webdev-command-center/webdev-command-center.user.js) and confirm in Tampermonkey.
3. Visit any HTTP/HTTPS page.
4. Use the floating **WebDev Command Center** in the lower-right corner.

To install from this repo instead, create a new userscript, paste in `webdev-command-center.user.js`, and save.

The Tampermonkey menu also provides:

- Toggle WebDev Command Center
- Run full WebDev audit
- Open Responsive Lab
- Clear annotations

## Run the optional AI bridge — no npm required

Requirements: Node.js 20+ only. The bridge uses Node's built-in `fetch()` and `http` modules, so there are **no npm packages to install**.

Put `webdev-ai-bridge.mjs` in any folder.

### macOS / Linux

```bash
OPENAI_API_KEY="YOUR_KEY" node webdev-ai-bridge.mjs
```

### PowerShell

```powershell
$env:OPENAI_API_KEY="YOUR_KEY"
node .\webdev-ai-bridge.mjs
```

Optional model override:

```powershell
$env:OPENAI_MODEL="gpt-5.6"
```

To verify the bridge is running, open `http://localhost:8787/health` in your browser. It reports whether an API key is configured without exposing the key.

Default endpoint:

```text
http://localhost:8787/analyze
```

Change the endpoint in the **AI** tab if you run the bridge elsewhere.

## Important limitations

- An automated scanner cannot certify ADA/WCAG compliance.
- California requirements vary by entity type and applicability; the tool intentionally marks ambiguous/state-only issues for verification instead of inventing a requirement.
- The security section is a page-level heuristic review, **not** a penetration test or vulnerability scanner.
- Performance signals come from the browser Performance API and DOM heuristics; use Lighthouse, WebPageTest, Chrome Performance tools, and real-user metrics for deeper performance work.
- Full-page canvas screenshots can omit or fail on cross-origin assets that disallow canvas access.
- EyeDropper support varies by browser and requires a user gesture.
- Temporary editing and visual stress tests only alter the currently rendered page and are restored by refresh.
- Responsive iframe previews may be blocked by the target site’s framing policy.
