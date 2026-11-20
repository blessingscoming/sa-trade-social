/**
 * post.mjs — the robot. Reads the queue, posts everything due today, logs it.
 *
 *   node post.mjs --dry                     show what would go out, send nothing
 *   node post.mjs                           send today's due posts on every ready channel
 *   node post.mjs --date=2026-11-20         a specific day
 *   node post.mjs --only=telegraph,telegram
 *   node post.mjs --status                  which channels are armed, which need keys
 *
 * Channel readiness is decided by environment variables, nothing else. A channel
 * with no keys is skipped with a one-line reason — it never fails the run. Drop a
 * key in and that channel starts posting on the next run with zero code changes.
 *
 * No npm dependencies. Node 18+ native fetch and node:crypto only.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readQueue, ROOT } from './engine.mjs';

const args = process.argv.slice(2);
const flag = (n, d = '') => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1] || d;
const DRY = args.includes('--dry');
const DATE = flag('date', new Date().toISOString().slice(0, 10));
const ONLY = flag('only') ? flag('only').split(',').map((s) => s.trim()) : null;

const LOG = path.join(ROOT, 'posted.jsonl');
const GBP_DIR = path.join(ROOT, 'out', '_gbp-manual');

const env = (k) => process.env[k] || '';
const has = (...keys) => keys.every((k) => env(k));

/** Public URL for a rendered post image. Set ASSET_BASE to wherever the
 *  out/ folder is served from — raw.githubusercontent.com is free and works:
 *  ASSET_BASE=https://raw.githubusercontent.com/<you>/<repo>/main/_SOCIAL/out */
const assetUrl = (p, fmt) => {
  const base = env('ASSET_BASE').replace(/\/$/, '');
  if (!base) return null;
  return `${base}/${p.domain}/posts/${p.date}/${p.id}-${fmt}.png`;
};
const assetPath = (p, fmt) =>
  path.join(ROOT, 'out', p.domain, 'posts', p.date, `${p.id}-${fmt}.png`);

/* ------------------------------------------------------------- helpers -- */

async function jfetch(url, opt = {}) {
  const r = await fetch(url, opt);
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) throw new Error(`${r.status} ${String(text).slice(0, 300)}`);
  return body;
}

/** Telegraph wants its content as a node tree, not HTML. */
const toNodes = (markdownish) =>
  markdownish.split('\n\n').filter(Boolean).map((block) => {
    if (block.startsWith('- ') || /^\d+\.\s/.test(block)) {
      const tag = block.startsWith('- ') ? 'ul' : 'ol';
      return {
        tag,
        children: block.split('\n').map((li) => ({
          tag: 'li',
          children: [li.replace(/^(-\s|\d+\.\s)/, '')]
        }))
      };
    }
    if (block.length < 70 && !block.endsWith('.') && !block.includes('http')) {
      return { tag: 'h4', children: [block] };
    }
    return { tag: 'p', children: [block] };
  });

/* ------------------------------------------------------------ channels -- */
/* Each adapter: { ready(), why, async send(post) -> {url} }                 */

const channels = {
  /* ---- no keys needed -------------------------------------------------- */

  telegraph: {
    ready: () => true,
    why: 'no signup needed',
    async send(p) {
      let token = env('TELEGRAPH_TOKEN');
      if (!token) {
        const acc = await jfetch('https://api.telegra.ph/createAccount?' + new URLSearchParams({
          short_name: p.brandName.slice(0, 32),
          author_name: p.brandName,
          author_url: `https://${p.domain}`
        }));
        if (!acc.ok) throw new Error(JSON.stringify(acc));
        token = acc.result.access_token;
        // persist so every post from this network keeps one author identity
        fs.appendFileSync(path.join(ROOT, 'telegraph-tokens.txt'), `${p.domain}\t${token}\n`);
      }
      const res = await jfetch('https://api.telegra.ph/createPage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          access_token: token,
          title: p.title.slice(0, 254),
          author_name: p.brandName,
          author_url: `https://${p.domain}`,
          content: toNodes(p.long),
          return_content: false
        })
      });
      if (!res.ok) throw new Error(JSON.stringify(res));
      return { url: res.result.url };
    }
  },

  writeas: {
    ready: () => true,
    why: 'anonymous posting allowed',
    async send(p) {
      const res = await jfetch('https://write.as/api/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: p.title, body: p.long + `\n\n---\n${p.url}` })
      });
      const d = res.data || res;
      return { url: `https://write.as/${d.id}`, token: d.token };
    }
  },

  gbp: {
    ready: () => true,
    why: 'exports a paste-ready file — Google has no free write API',
    async send(p) {
      fs.mkdirSync(GBP_DIR, { recursive: true });
      const img = assetPath(p, 'gbp');
      const file = path.join(GBP_DIR, `${p.date}-${p.domain}.md`);
      fs.appendFileSync(file, [
        `## ${p.brandName} — ${p.suburbName}`,
        ``,
        `**Image:** ${fs.existsSync(img) ? img : '(run: node assets.mjs --posts --date=' + p.date + ')'}`,
        ``,
        `**Post text (paste into Google Business Profile → Add update):**`,
        ``,
        p.short.replace(/#\S+/g, '').trim(),
        ``,
        `**Button:** "Learn more" → ${p.url}`,
        ``,
        `---`, ``
      ].join('\n'));
      return { url: file };
    }
  },

  /* ---- keys required --------------------------------------------------- */

  telegram: {
    ready: () => has('TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'),
    why: 'set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID',
    async send(p) {
      const base = `https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}`;
      const img = assetUrl(p, 'square');
      const res = img
        ? await jfetch(`${base}/sendPhoto`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: env('TELEGRAM_CHAT_ID'), photo: img, caption: p.short.slice(0, 1024) })
          })
        : await jfetch(`${base}/sendMessage`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: env('TELEGRAM_CHAT_ID'), text: p.short, disable_web_page_preview: false })
          });
      return { url: `tg:${res.result?.message_id}` };
    }
  },

  facebook: {
    ready: () => has('FB_PAGE_ID', 'FB_PAGE_TOKEN'),
    why: 'set FB_PAGE_ID and FB_PAGE_TOKEN (Meta Graph API, free)',
    async send(p) {
      const v = env('FB_API_VERSION') || 'v21.0';
      const img = assetUrl(p, 'square');
      const url = img
        ? `https://graph.facebook.com/${v}/${env('FB_PAGE_ID')}/photos`
        : `https://graph.facebook.com/${v}/${env('FB_PAGE_ID')}/feed`;
      const body = new URLSearchParams(
        img
          ? { url: img, caption: p.short, access_token: env('FB_PAGE_TOKEN') }
          : { message: p.short, link: p.url, access_token: env('FB_PAGE_TOKEN') }
      );
      const res = await jfetch(url, { method: 'POST', body });
      return { url: `fb:${res.post_id || res.id}` };
    }
  },

  instagram: {
    ready: () => has('IG_USER_ID', 'FB_PAGE_TOKEN', 'ASSET_BASE'),
    why: 'set IG_USER_ID, FB_PAGE_TOKEN and ASSET_BASE (IG needs a public image URL)',
    async send(p) {
      const v = env('FB_API_VERSION') || 'v21.0';
      const img = assetUrl(p, 'square');
      if (!img) throw new Error('ASSET_BASE not set');
      const container = await jfetch(`https://graph.facebook.com/${v}/${env('IG_USER_ID')}/media`, {
        method: 'POST',
        body: new URLSearchParams({ image_url: img, caption: p.short, access_token: env('FB_PAGE_TOKEN') })
      });
      const res = await jfetch(`https://graph.facebook.com/${v}/${env('IG_USER_ID')}/media_publish`, {
        method: 'POST',
        body: new URLSearchParams({ creation_id: container.id, access_token: env('FB_PAGE_TOKEN') })
      });
      return { url: `ig:${res.id}` };
    }
  },

  pinterest: {
    ready: () => has('PINTEREST_TOKEN', 'PINTEREST_BOARD_ID', 'ASSET_BASE'),
    why: 'set PINTEREST_TOKEN, PINTEREST_BOARD_ID and ASSET_BASE',
    async send(p) {
      const img = assetUrl(p, 'pin');
      if (!img) throw new Error('ASSET_BASE not set');
      const res = await jfetch('https://api.pinterest.com/v5/pins', {
        method: 'POST',
        headers: { authorization: `Bearer ${env('PINTEREST_TOKEN')}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          board_id: env('PINTEREST_BOARD_ID'),
          title: p.title.slice(0, 100),
          description: p.short.slice(0, 800),
          link: p.url,
          media_source: { source_type: 'image_url', url: img }
        })
      });
      return { url: `pin:${res.id}` };
    }
  },

  devto: {
    ready: () => has('DEVTO_API_KEY'),
    why: 'set DEVTO_API_KEY',
    async send(p) {
      const res = await jfetch('https://dev.to/api/articles', {
        method: 'POST',
        headers: { 'api-key': env('DEVTO_API_KEY'), 'content-type': 'application/json' },
        body: JSON.stringify({
          article: {
            title: p.title.slice(0, 128),
            published: true,
            body_markdown: p.long,
            tags: p.tags.map((t) => t.replace('#', '').toLowerCase().slice(0, 20)).slice(0, 4),
            canonical_url: p.url.split('?')[0]
          }
        })
      });
      return { url: res.url };
    }
  },

  reddit: {
    ready: () => has('REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USERNAME', 'REDDIT_PASSWORD', 'REDDIT_SUBREDDIT'),
    why: 'set REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD/SUBREDDIT — and read the sub rules first',
    async send(p) {
      const basic = Buffer.from(`${env('REDDIT_CLIENT_ID')}:${env('REDDIT_CLIENT_SECRET')}`).toString('base64');
      const ua = 'sa-trade-network/1.0';
      const tok = await jfetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: { authorization: `Basic ${basic}`, 'user-agent': ua },
        body: new URLSearchParams({
          grant_type: 'password', username: env('REDDIT_USERNAME'), password: env('REDDIT_PASSWORD')
        })
      });
      const res = await jfetch('https://oauth.reddit.com/api/submit', {
        method: 'POST',
        headers: { authorization: `Bearer ${tok.access_token}`, 'user-agent': ua },
        body: new URLSearchParams({
          sr: env('REDDIT_SUBREDDIT'), kind: 'self', title: p.title.slice(0, 300),
          text: p.long, api_type: 'json'
        })
      });
      const err = res?.json?.errors?.[0];
      if (err) throw new Error(err.join(' '));
      return { url: res?.json?.data?.url || 'reddit:ok' };
    }
  },

  x: {
    ready: () => has('X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'),
    why: 'set X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_SECRET (free tier: 500 posts a month)',
    async send(p) {
      const url = 'https://api.twitter.com/2/tweets';
      const oauth = {
        oauth_consumer_key: env('X_API_KEY'),
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: env('X_ACCESS_TOKEN'),
        oauth_version: '1.0'
      };
      const enc = (s) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
      // JSON body params are NOT part of an OAuth 1.0a signature base string
      const paramStr = Object.keys(oauth).sort().map((k) => `${enc(k)}=${enc(oauth[k])}`).join('&');
      const base = ['POST', enc(url), enc(paramStr)].join('&');
      const key = `${enc(env('X_API_SECRET'))}&${enc(env('X_ACCESS_SECRET'))}`;
      oauth.oauth_signature = crypto.createHmac('sha1', key).update(base).digest('base64');
      const header = 'OAuth ' + Object.keys(oauth).sort().map((k) => `${enc(k)}="${enc(oauth[k])}"`).join(', ');

      // X counts a URL as 23 chars; trim the body, never the link.
      // WhatsApp wins when it exists — a wa.me tap beats a landing page.
      const link = p.wa || p.url;
      let text = p.short.replace(p.wa || '\0', '').replace(p.url, '').trim();
      const budget = 280 - 24 - 1;
      if (text.length > budget) text = text.slice(0, budget - 1).replace(/\s\S*$/, '') + '…';
      const res = await jfetch(url, {
        method: 'POST',
        headers: { authorization: header, 'content-type': 'application/json' },
        body: JSON.stringify({ text: `${text}\n${link}` })
      });
      return { url: `x:${res.data?.id}` };
    }
  }
};

/* ----------------------------------------------------------------- run -- */

/* A post counts as done only when it came back with a live URL. A failed
   attempt must stay in the queue, or one network blip silently drops that
   post forever — but it also must not retry into a wall every day, so three
   failures retire it. */
const history = fs.existsSync(LOG)
  ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];
const posted = new Set(history.filter((r) => r.liveUrl).map((r) => r.id));
const failCount = new Map();
for (const r of history) {
  if (!r.liveUrl) failCount.set(r.id, (failCount.get(r.id) || 0) + 1);
}
const RETIRED = 3;

if (args.includes('--status')) {
  console.log(`Channel readiness  (date ${DATE})\n`);
  for (const [name, c] of Object.entries(channels)) {
    const ok = c.ready();
    console.log(`  ${ok ? 'ARMED ' : 'idle  '} ${name.padEnd(12)} ${ok ? '' : '— ' + c.why}`);
  }
  console.log(`\n  ASSET_BASE ${env('ASSET_BASE') ? '= ' + env('ASSET_BASE') : 'not set — image posts will fall back to text'}`);
  process.exit(0);
}

const due = readQueue()
  .filter((r) => r.date === DATE)
  .filter((r) => !ONLY || ONLY.includes(r.channel))
  .filter((r) => !posted.has(r.id))
  .filter((r) => (failCount.get(r.id) || 0) < RETIRED);

if (!due.length) {
  console.log(`Nothing due for ${DATE}${ONLY ? ' on ' + ONLY.join(',') : ''}. (Already sent, or run: node engine.mjs --days=90)`);
  process.exit(0);
}

let sent = 0, skipped = 0, failed = 0;
console.log(`${due.length} post(s) due for ${DATE}${DRY ? '  [DRY RUN — nothing will be sent]' : ''}\n`);

for (const p of due) {
  const c = channels[p.channel];
  if (!c) { console.log(`  ?  ${p.channel}: no adapter`); skipped++; continue; }
  if (!c.ready()) { console.log(`  -  ${p.channel.padEnd(11)} skipped — ${c.why}`); skipped++; continue; }

  const label = `${p.channel.padEnd(11)} ${p.domain.padEnd(28)} ${p.title.slice(0, 46)}`;
  if (DRY) { console.log(`  ·  ${label}`); continue; }

  try {
    const res = await c.send(p);
    fs.appendFileSync(LOG, JSON.stringify({
      id: p.id, date: p.date, channel: p.channel, domain: p.domain,
      title: p.title, liveUrl: res.url, at: new Date().toISOString(), ...(res.token ? { token: res.token } : {})
    }) + '\n');
    console.log(`  OK ${label}\n     -> ${res.url}`);
    sent++;
    await new Promise((r) => setTimeout(r, 1500)); // be a good API citizen
  } catch (e) {
    fs.appendFileSync(LOG, JSON.stringify({
      id: p.id, date: p.date, channel: p.channel, domain: p.domain, error: String(e.message).slice(0, 400), at: new Date().toISOString()
    }) + '\n');
    console.log(`  !! ${label}\n     ${String(e.message).slice(0, 200)}`);
    failed++;
  }
}

console.log(`\nsent ${sent} · skipped ${skipped} · failed ${failed}`);

/* Google Business Profile is the channel that converts best for a local trade, and it is
   the one a human has to paste by hand. Two files buried under out/_gbp-manual/ is enough
   friction to make that daily minute not happen — so collapse today's pastes into one file
   that is always at the same path, and print that path last where the run cannot hide it. */
if (!DRY) {
  const today = fs.existsSync(GBP_DIR)
    ? fs.readdirSync(GBP_DIR).filter((f) => f.startsWith(DATE)).sort()
    : [];
  if (today.length) {
    const roll = path.join(ROOT, 'TODAY-GBP.md');
    fs.writeFileSync(roll, [
      `# Google Business Profile — paste these today (${DATE})`,
      ``,
      `${today.length} update(s). For each: open the profile, Add update, paste the text,`,
      `attach the image at the path given, set the button. About 60 seconds each.`,
      ``,
      /* The per-domain file is written at send time, so if the card had not rendered yet it
         holds a "run assets.mjs" placeholder. Resolve it here instead — by roll-up time the
         card usually exists, and this is the one file a human opens every morning. */
      ...today.map((f) => {
        const body = fs.readFileSync(path.join(GBP_DIR, f), 'utf8');
        if (!body.includes('(run: node assets.mjs')) return body;
        const domain = f.replace(`${DATE}-`, '').replace(/\.md$/, '');
        const dir = path.join(ROOT, 'out', domain, 'posts', DATE);
        const card = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => n.endsWith('-gbp.png')) : null;
        return card ? body.replace(/\(run: node assets\.mjs[^)]*\)/g, path.join(dir, card)) : body;
      })
    ].join('\n'));
    console.log(`\nPASTE TODAY -> ${roll}  (${today.length} profile update(s))`);
  }
}

if (failed && !sent) process.exitCode = 1;
