/**
 * WebDev Command Center — Zero-dependency AI bridge
 *
 * NO NPM PACKAGES REQUIRED.
 * Requires Node.js 20+ (native fetch).
 *
 * Environment:
 *   OPENAI_API_KEY=your_key_here
 *   OPENAI_MODEL=gpt-5.6        (optional)
 *   PORT=8787                   (optional)
 *
 * macOS/Linux:
 *   OPENAI_API_KEY="your_key_here" node webdev-ai-bridge-no-npm.mjs
 *
 * Windows PowerShell:
 *   $env:OPENAI_API_KEY="your_key_here"
 *   node .\webdev-ai-bridge-no-npm.mjs
 */

import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function collectResponseText(data) {
  const parts = [];
  for (const item of data?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n\n').trim();
}

function collectCitations(data) {
  const byUrl = new Map();

  for (const item of data?.output || []) {
    if (item?.type === 'message') {
      for (const content of item.content || []) {
        for (const annotation of content?.annotations || []) {
          if (annotation?.type !== 'url_citation') continue;
          const url = annotation.url || annotation.url_citation?.url;
          const title = annotation.title || annotation.url_citation?.title || url;
          if (url) byUrl.set(url, { title, url });
        }
      }
    }

    if (item?.type === 'web_search_call') {
      for (const source of item?.action?.sources || []) {
        const url = source?.url;
        const title = source?.title || source?.name || url;
        if (url) byUrl.set(url, { title, url });
      }
    }
  }

  return [...byUrl.values()];
}

function buildPrompt(brief, queries) {
  return `
You are a senior web design strategist, frontend engineering reviewer, accessibility reviewer, and public-sector digital-service UX consultant.

CURRENT PAGE BRIEF
${JSON.stringify(brief, null, 2)}

SEARCH STARTERS
${JSON.stringify(queries || [], null, 2)}

REVIEW FRAMEWORK
Treat automated evidence and manual professional judgment separately. Never claim that an automated review proves legal ADA compliance.

For California/public-sector work, prioritize primary sources when researching standards, including:
- webstandards.ca.gov
- ada.gov
- w3.org/WAI
- dor.ca.gov where relevant

Tasks:
1. Infer the campaign or page's primary objective, target audience, primary CTA, secondary conversions, and desired user journey. Clearly label assumptions.
2. Explain what the page is trying to accomplish in plain language.
3. Assess information architecture, content hierarchy, messaging, visual hierarchy, CTA placement, navigation leakage, mobile UX, form UX, accessibility signals, performance signals, trust/proof, and conversion path.
4. Assess the experience against California Web Standards/design principles where applicable. Separate:
   - Required / standards-based issues
   - California state-only requirements if actually applicable
   - Best-practice recommendations
   - Manual-review items
5. Search the live web for 5-8 strong, relevant examples of campaigns, public-sector services, recruitment pages, landing pages, or comparable experiences with a similar objective/audience.
6. For each example, explain why it is relevant, the specific pattern worth borrowing, and what should NOT be copied blindly.
7. Produce 3 distinct redesign directions. For each specify hero strategy, content sequence, CTA model, visual system, proof/trust elements, accessibility considerations, mobile behavior, and performance considerations.
8. Identify quick wins that can be implemented without a full redesign.
9. Produce a prioritized implementation backlog using P0 / P1 / P2.
10. Cite factual claims based on web research and include useful source URLs.

Be practical, specific, and senior-level. Avoid vague advice such as "make it modern" unless you define the exact change and rationale.
`.trim();
}

async function callOpenAI(brief, queries) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set. Set it in your terminal before starting the bridge.');
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      reasoning: { effort: 'low' },
      tools: [{ type: 'web_search' }],
      tool_choice: 'auto',
      include: ['web_search_call.action.sources'],
      input: buildPrompt(brief, queries)
    })
  });

  const raw = await response.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI returned non-JSON data (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || `OpenAI API request failed (HTTP ${response.status}).`;
    throw new Error(message);
  }

  const report = collectResponseText(data);
  if (!report) throw new Error('OpenAI returned no text report.');

  return {
    report,
    citations: collectCitations(data),
    responseId: data.id || null,
    model: data.model || MODEL
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, {
      ok: true,
      service: 'WebDev Command Center AI Bridge',
      npmRequired: false,
      model: MODEL,
      apiKeyConfigured: Boolean(OPENAI_API_KEY)
    });
  }
  if (req.method !== 'POST' || req.url !== '/analyze') {
    return sendJson(res, 404, { error: 'Not found' });
  }

  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 2_000_000) throw new Error('Request too large');
    }

    const payload = JSON.parse(raw || '{}');
    const { brief, queries } = payload;
    if (!brief?.url) return sendJson(res, 400, { error: 'Missing brief.url' });

    const result = await callOpenAI(brief, queries);
    return sendJson(res, 200, result);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: error?.message || String(error) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('WebDev Command Center AI Bridge');
  console.log('--------------------------------');
  console.log(`Listening: http://127.0.0.1:${PORT}/analyze`);
  console.log(`Health:    http://127.0.0.1:${PORT}/health`);
  console.log(`Model:     ${MODEL}`);
  console.log(`API key:   ${OPENAI_API_KEY ? 'configured' : 'MISSING'}`);
  console.log('npm:       NOT REQUIRED');
  console.log('');
});
