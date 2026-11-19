/**
 * assets.mjs — social asset packs for the 8 SA trade brands.
 *
 * Reuses the brand system already built in ../_BRAND: each brand's mark.svg,
 * hero-pat.svg and theme.json are the source of truth, so these social assets
 * cannot drift from the websites, favicons and OG cards.
 *
 *   node assets.mjs --static                 identity pack, all 8 brands
 *   node assets.mjs --static --only=sapoolpros.co.za
 *   node assets.mjs --posts --date=2026-11-20    render that day's queue images
 *   node assets.mjs --posts --limit=4        render the first 4 only (fast check)
 *
 * Output: out/<domain>/identity/*.png and out/<domain>/posts/<id>-<fmt>.png
 *
 * Rendering is Chrome headless screenshots of local HTML — the same pipeline
 * brandkit.mjs uses. No Puppeteer, no npm install, no API keys, no cost.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadNetwork, readQueue } from './engine.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRARTER = path.join(ROOT, '..');
const BRAND_OUT = path.join(SRARTER, '_BRAND', 'out');
const FONT_DIR = path.join(SRARTER, '_CLEAN', 'src', 'fonts');
const OUT = path.join(ROOT, 'out');
const TMP = path.join(ROOT, '.render');

const args = process.argv.slice(2);
const flag = (n, d = '') => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1] || d;
const ONLY = flag('only');
const LIMIT = Number(flag('limit', '0'));
const DATE = flag('date', new Date().toISOString().slice(0, 10));

fs.mkdirSync(TMP, { recursive: true });

/* ------------------------------------------------------------- colour -- */

const hex2rgb = (h) => {
  const s = h.replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
};
const rgb2hex = (r) => '#' + r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const lum = (hex) => {
  const [r, g, b] = hex2rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * t));
/** Lighten a hue toward white until it reads at 4.5:1 on the brand's ink. */
const onInk = (hex, ink, target = 4.5) => {
  let c = hex;
  for (let t = 0; t <= 1 && contrast(c, ink) < target; t += 0.04) c = mix(hex, '#FFFFFF', t);
  return c;
};

/* -------------------------------------------------------------- render -- */

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find((p) => fs.existsSync(p));

const fontCss = (() => {
  const load = (f) => {
    const p = path.join(FONT_DIR, f);
    return fs.existsSync(p) ? fs.readFileSync(p).toString('base64') : null;
  };
  const fr = load('fraunces-latin-wght-normal.woff2');
  const it = load('inter-latin-wght-normal.woff2');
  let css = '';
  if (fr) css += `@font-face{font-family:Fraunces;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${fr}) format('woff2')}`;
  if (it) css += `@font-face{font-family:InterVar;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${it}) format('woff2')}`;
  return css;
})();

const DISPLAY = `Fraunces, Georgia, 'Times New Roman', serif`;
const BODY = `InterVar, Inter, 'Segoe UI', system-ui, sans-serif`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let renders = 0;
function shot(html, out, w, h, assetDir) {
  if (!CHROME) throw new Error('No Chrome or Edge found. Install Chrome or run with --no-png.');
  // write the page INTO the brand's asset dir so relative mark.svg / hero-pat.svg resolve
  const tmp = path.join(assetDir, `.social-${path.basename(out, '.png')}.html`);
  fs.writeFileSync(tmp, html);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try {
    execFileSync(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--force-device-scale-factor=1', '--virtual-time-budget=4000',
      `--window-size=${w},${h}`, `--screenshot=${out}`, pathToFileURL(tmp).href
    ], { stdio: 'ignore', timeout: 60000 });
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  if (!fs.existsSync(out)) throw new Error(`render failed: ${path.basename(out)}`);
  renders++;
}

const page = (w, h, css, body) => `<!doctype html><html><head><meta charset="utf-8">
<style>${fontCss}*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden}
body{font-family:${BODY};-webkit-font-smoothing:antialiased;background:#000}${css}</style></head><body>${body}</body></html>`;

/** The shared chrome every social surface sits on: ink field, two-hue glow,
 *  glyph watermark. One silhouette across 8 brands and 9 formats. */
const field = (b, { pat = 1, patSize = 620, patPos = 'right:-80px;bottom:-130px' } = {}) => `
  .field{position:absolute;inset:0;background:${b.ink}}
  .glow{position:absolute;inset:0;background:
    radial-gradient(60% 70% at 10% 4%, ${b.accent}52 0%, transparent 70%),
    radial-gradient(54% 64% at 98% 106%, ${b.signal}38 0%, transparent 72%)}
  .pat{position:absolute;${patPos};width:${patSize}px;opacity:${0.085 * pat}}
  .rule{height:7px;border-radius:99px;background:linear-gradient(90deg,${b.accent},${b.signal})}
  .pill{display:inline-block;font-weight:600;color:#fff;background:#ffffff1a;border:1px solid #ffffff2e;border-radius:999px}
  .kicker{letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:${b.signalOnInk}}
  h1,h2{font-family:${DISPLAY};font-weight:600;color:#fff;letter-spacing:-.015em;line-height:1.05}
  em{font-style:normal;color:${b.accentOnInk}}`;

const shell = (inner) => `<div class="field"></div><div class="glow"></div><img class="pat" src="hero-pat.svg">${inner}`;

/* ---------------------------------------------------- identity formats -- */

const IDENTITY = [
  {
    file: 'avatar-1000.png', w: 1000, h: 1000,
    note: 'Profile picture — every platform. Square, safe inside a circle crop.',
    html: (b) => page(1000, 1000,
      `${field(b, { patSize: 900, patPos: 'left:50%;top:50%;transform:translate(-50%,-50%)' })}
       .wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
       img.mark{width:620px;height:620px;border-radius:174px}`,
      shell(`<div class="wrap"><img class="mark" src="mark.svg"></div>`))
  },
  {
    file: 'fb-cover-1640x624.png', w: 1640, h: 624,
    note: 'Facebook Page cover. Centre 820x312 is the mobile-safe area.',
    html: (b) => page(1640, 624,
      `${field(b, { patSize: 560 })}
       .wrap{position:absolute;inset:0;padding:0 150px;display:flex;align-items:center;gap:46px}
       img.mark{width:160px;height:160px;border-radius:46px;flex:0 0 auto}
       .txt{max-width:980px}
       .kicker{font-size:21px}
       h1{font-size:62px;margin-top:12px}
       p{margin-top:16px;font-size:26px;line-height:1.35;color:#ffffffc4}`,
      shell(`<div class="wrap"><img class="mark" src="mark.svg">
        <div class="txt"><div class="kicker">${esc(b.trade)} · Gauteng</div>
        <h1><em>${esc(b.short)}</em></h1><p>${esc(b.bioShort || b.tagline)}</p></div></div>`))
  },
  {
    file: 'x-header-1500x500.png', w: 1500, h: 500,
    note: 'X / Twitter header. Avatar overlaps lower-left — keep that corner clear.',
    html: (b) => page(1500, 500,
      `${field(b, { patSize: 480, patPos: 'right:-60px;top:-90px' })}
       .wrap{position:absolute;inset:0;padding:0 96px 0 420px;display:flex;flex-direction:column;justify-content:center}
       .kicker{font-size:19px}
       h1{font-size:56px;margin-top:10px}
       p{margin-top:14px;font-size:24px;color:#ffffffc4;max-width:900px}
       .rule{width:180px;margin-top:22px}`,
      shell(`<div class="wrap"><div class="kicker">${esc(b.trade)}</div>
        <h1><em>${esc(b.short)}</em></h1><p>${esc(b.bioShort || b.tagline)}</p><div class="rule"></div></div>`))
  },
  {
    file: 'linkedin-1128x191.png', w: 1128, h: 191,
    note: 'LinkedIn Page banner. Logo overlaps left — text starts at 300px.',
    html: (b) => page(1128, 191,
      `${field(b, { patSize: 320, patPos: 'right:-40px;bottom:-80px' })}
       .wrap{position:absolute;inset:0;padding:0 56px 0 300px;display:flex;align-items:center;justify-content:space-between}
       h1{font-size:34px}
       .dom{font-size:17px;padding:10px 20px}`,
      shell(`<div class="wrap"><h1><em>${esc(b.short)}</em> · ${esc(b.trade)}</h1>
        <span class="pill dom">${esc(b.domain)}</span></div>`))
  },
  {
    file: 'youtube-2560x1440.png', w: 2560, h: 1440,
    note: 'YouTube channel art. Only the centre 1546x423 shows on TV — all text sits inside it.',
    html: (b) => page(2560, 1440,
      `${field(b, { patSize: 900 })}
       .safe{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:1546px;height:423px;
             display:flex;align-items:center;gap:56px;padding:0 40px}
       img.mark{width:220px;height:220px;border-radius:62px;flex:0 0 auto}
       .kicker{font-size:26px}
       h1{font-size:84px;margin-top:14px}
       p{margin-top:18px;font-size:32px;color:#ffffffc4}`,
      shell(`<div class="safe"><img class="mark" src="mark.svg">
        <div><div class="kicker">${esc(b.trade)} · Gauteng</div>
        <h1><em>${esc(b.short)}</em></h1><p>${esc(b.bioShort || b.tagline)}</p></div></div>`))
  },
  {
    file: 'whatsapp-dp-640.png', w: 640, h: 640,
    note: 'WhatsApp Business display picture.',
    html: (b) => page(640, 640,
      `${field(b, { patSize: 580, patPos: 'left:50%;top:50%;transform:translate(-50%,-50%)' })}
       .wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
       img.mark{width:400px;height:400px;border-radius:112px}`,
      shell(`<div class="wrap"><img class="mark" src="mark.svg"></div>`))
  }
];

/* -------------------------------------------------------- post formats -- */

/** Shared inner composition for a content card, scaled by format. */
function cardInner(b, p, S) {
  const t = p.image.template;
  const bullets = (p.image.bullets || []).slice(0, S.bullets);
  const headline = p.image.headline.replace(/^"|"$/g, '');
  return `
  <div class="card">
    <div class="top"><img class="mark" src="mark.svg"><span class="kicker">${esc(p.image.kicker)} · Gauteng</span></div>
    <div class="mid">
      <h1>${esc(headline)}</h1>
      ${t === 'price-card' ? `<div class="price"><span class="plabel">Published band</span><span class="pval${p.image.value.length > 52 ? ' long' : ''}">${esc(p.image.value)}</span></div>` : ''}
      ${t === 'checklist-card' ? `<ul>${bullets.map((x) => `<li>${esc(x.charAt(0).toUpperCase() + x.slice(1))}</li>`).join('')}</ul>` : ''}
      ${t === 'statement-card' ? `<p class="lead">${esc(p.image.value)}</p>` : ''}
    </div>
    <div class="bar"><span class="pill dom">${esc(p.image.domain)}</span><span class="rule"></span></div>
  </div>`;
}

const POST_FORMATS = [
  {
    file: 'square', w: 1080, h: 1080, bullets: 4,
    note: 'Instagram + Facebook feed.',
    css: (b) => `${field(b, { patSize: 620 })}
      .card{position:absolute;inset:0;padding:84px 78px;display:flex;flex-direction:column;justify-content:space-between}
      .top{display:flex;align-items:center;gap:20px}.mark{width:84px;height:84px;border-radius:24px}
      .kicker{font-size:20px}
      h1{font-size:68px}
      .price{margin-top:34px;display:flex;flex-direction:column;gap:8px}
      .plabel{font-size:19px;letter-spacing:.14em;text-transform:uppercase;color:#ffffff8c;font-weight:600}
      .pval{font-family:${DISPLAY};font-size:56px;font-weight:600;color:${b.accentOnInk};line-height:1.1}
      .pval.long{font-size:34px;line-height:1.22}
      ul{margin-top:30px;list-style:none;display:flex;flex-direction:column;gap:17px}
      li{font-size:27px;line-height:1.32;color:#ffffffd4;padding-left:38px;position:relative}
      li:before{content:"";position:absolute;left:0;top:11px;width:17px;height:17px;border-radius:5px;background:${b.signal}}
      .lead{margin-top:28px;font-size:31px;line-height:1.38;color:#ffffffc9}
      .bar{display:flex;align-items:center;justify-content:space-between}
      .dom{font-size:24px;padding:12px 24px}.rule{width:170px}`
  },
  {
    file: 'story', w: 1080, h: 1920, bullets: 5,
    note: 'Instagram / Facebook story and WhatsApp status. Top and bottom 250px kept clear of UI.',
    css: (b) => `${field(b, { patSize: 760, patPos: 'right:-140px;bottom:-200px' })}
      .card{position:absolute;inset:0;padding:290px 82px 300px;display:flex;flex-direction:column;justify-content:space-between}
      .top{display:flex;align-items:center;gap:22px}.mark{width:96px;height:96px;border-radius:28px}
      .kicker{font-size:22px}
      h1{font-size:82px}
      .price{margin-top:44px;display:flex;flex-direction:column;gap:10px}
      .plabel{font-size:21px;letter-spacing:.14em;text-transform:uppercase;color:#ffffff8c;font-weight:600}
      .pval{font-family:${DISPLAY};font-size:66px;font-weight:600;color:${b.accentOnInk};line-height:1.1}
      .pval.long{font-size:40px;line-height:1.22}
      ul{margin-top:42px;list-style:none;display:flex;flex-direction:column;gap:22px}
      li{font-size:31px;line-height:1.32;color:#ffffffd4;padding-left:44px;position:relative}
      li:before{content:"";position:absolute;left:0;top:13px;width:19px;height:19px;border-radius:6px;background:${b.signal}}
      .lead{margin-top:36px;font-size:37px;line-height:1.38;color:#ffffffc9}
      .bar{display:flex;flex-direction:column;align-items:flex-start;gap:26px}
      .dom{font-size:28px;padding:15px 30px}.rule{width:210px}`
  },
  {
    file: 'pin', w: 1000, h: 1500, bullets: 5,
    note: 'Pinterest. 2:3 is the only ratio Pinterest shows at full size.',
    css: (b) => `${field(b, { patSize: 700, patPos: 'right:-120px;bottom:-170px' })}
      .card{position:absolute;inset:0;padding:92px 76px;display:flex;flex-direction:column;justify-content:space-between}
      .top{display:flex;align-items:center;gap:20px}.mark{width:88px;height:88px;border-radius:26px}
      .kicker{font-size:20px}
      h1{font-size:74px}
      .price{margin-top:38px;display:flex;flex-direction:column;gap:9px}
      .plabel{font-size:19px;letter-spacing:.14em;text-transform:uppercase;color:#ffffff8c;font-weight:600}
      .pval{font-family:${DISPLAY};font-size:58px;font-weight:600;color:${b.accentOnInk};line-height:1.1}
      .pval.long{font-size:35px;line-height:1.22}
      ul{margin-top:36px;list-style:none;display:flex;flex-direction:column;gap:19px}
      li{font-size:28px;line-height:1.32;color:#ffffffd4;padding-left:40px;position:relative}
      li:before{content:"";position:absolute;left:0;top:12px;width:18px;height:18px;border-radius:5px;background:${b.signal}}
      .lead{margin-top:32px;font-size:33px;line-height:1.38;color:#ffffffc9}
      .bar{display:flex;align-items:center;justify-content:space-between}
      .dom{font-size:25px;padding:13px 26px}.rule{width:180px}`
  },
  {
    file: 'gbp', w: 1200, h: 900, bullets: 4,
    note: 'Google Business Profile post. 4:3, the format GBP crops least.',
    css: (b) => `${field(b, { patSize: 560 })}
      .card{position:absolute;inset:0;padding:76px 80px;display:flex;flex-direction:column;justify-content:space-between}
      .top{display:flex;align-items:center;gap:18px}.mark{width:78px;height:78px;border-radius:22px}
      .kicker{font-size:19px}
      h1{font-size:60px}
      .price{margin-top:28px;display:flex;flex-direction:column;gap:7px}
      .plabel{font-size:18px;letter-spacing:.14em;text-transform:uppercase;color:#ffffff8c;font-weight:600}
      .pval{font-family:${DISPLAY};font-size:48px;font-weight:600;color:${b.accentOnInk};line-height:1.1}
      .pval.long{font-size:30px;line-height:1.22}
      ul{margin-top:26px;list-style:none;display:flex;flex-direction:column;gap:15px}
      li{font-size:25px;line-height:1.3;color:#ffffffd4;padding-left:35px;position:relative}
      li:before{content:"";position:absolute;left:0;top:10px;width:16px;height:16px;border-radius:5px;background:${b.signal}}
      .lead{margin-top:24px;font-size:29px;line-height:1.38;color:#ffffffc9}
      .bar{display:flex;align-items:center;justify-content:space-between}
      .dom{font-size:22px;padding:11px 22px}.rule{width:150px}`
  }
];

/* ----------------------------------------------------------------- run -- */

const { brands } = loadNetwork();
const prepped = brands.map((b) => ({
  ...b,
  accentOnInk: onInk(b.accent, b.ink),
  signalOnInk: onInk(b.signal, b.ink, 4.5)
}));

const targets = prepped.filter((b) => !ONLY || b.domain === ONLY);
if (!targets.length) {
  console.error(`No brand matched --only=${ONLY}`);
  process.exit(1);
}

const t0 = Date.now();

if (args.includes('--static') || (!args.includes('--posts') && !args.includes('--list'))) {
  for (const b of targets) {
    const assetDir = path.join(BRAND_OUT, b.domain);
    if (!fs.existsSync(path.join(assetDir, 'mark.svg'))) {
      console.error(`! ${b.domain}: no mark.svg in _BRAND/out — run brandkit.mjs first`);
      continue;
    }
    const dir = path.join(OUT, b.domain, 'identity');
    for (const f of IDENTITY) {
      shot(f.html(b), path.join(dir, f.file), f.w, f.h, assetDir);
      console.log(`  ${b.domain}  ${f.file}`);
    }
    // bios + hashtags as a paste-ready text file next to the images
    fs.writeFileSync(path.join(dir, 'PROFILE-COPY.txt'),
      [
        `${b.brand} — profile copy`, '='.repeat(60), '',
        `Handle (claim on every platform): @${b.handle || b.domain.split('.')[0]}`, '',
        ...(b.inRotation ? [] : ['NOTE: this brand is not in the daily posting rotation — assets only.', '']),
        `Short bio (150 chars, X / IG / GBP):`, b.bioShort || b.tagline, '',
        `Long bio (FB About / LinkedIn / YouTube):`, b.bioLong || b.tagline, '',
        `Call to action:`, b.cta || 'Get a quote', '',
        `Website:`, `https://${b.domain}`, '',
        `Hashtag set (rotate 5 per post, never all 10):`, (b.hashtags || []).join(' '), '',
        `Subreddits (value first, link only when it genuinely helps):`, (b.subreddits || []).join(', '), '',
        `Pinterest boards to create:`, (b.pinterestBoards || []).join(' | '), '',
        `Brand colours: ink ${b.ink} · accent ${b.accent} · signal ${b.signal}`,
        `Accent on ink (text colour on dark): ${b.accentOnInk}`
      ].join('\n'));
    console.log(`  ${b.domain}  PROFILE-COPY.txt`);
  }
}

if (args.includes('--posts')) {
  const queue = readQueue().filter((r) => r.date === DATE && ['image', 'export', 'short'].includes(r.kind));
  const rows = LIMIT ? queue.slice(0, LIMIT) : queue;
  if (!rows.length) {
    console.log(`No image-bearing posts queued for ${DATE}. Run: node engine.mjs --days=90`);
  }
  for (const p of rows) {
    const b = prepped.find((x) => x.domain === p.domain);
    if (!b) continue;
    const assetDir = path.join(BRAND_OUT, b.domain);
    if (!fs.existsSync(path.join(assetDir, 'mark.svg'))) continue;
    const want = p.channel === 'pinterest' ? ['pin']
      : p.channel === 'gbp' ? ['gbp']
        : p.channel === 'instagram' ? ['square', 'story']
          : ['square'];
    for (const f of POST_FORMATS.filter((x) => want.includes(x.file))) {
      const html = page(f.w, f.h, f.css(b), shell(cardInner(b, p, { bullets: f.bullets })));
      const out = path.join(OUT, b.domain, 'posts', DATE, `${p.id}-${f.file}.png`);
      shot(html, out, f.w, f.h, assetDir);
      console.log(`  ${p.domain}  ${p.channel}/${f.file}  ${p.title.slice(0, 50)}`);
    }
  }
}

if (args.includes('--list')) {
  console.log('IDENTITY FORMATS');
  for (const f of IDENTITY) console.log(`  ${f.file.padEnd(28)} ${f.w}x${f.h}  ${f.note}`);
  console.log('\nPOST FORMATS');
  for (const f of POST_FORMATS) console.log(`  ${f.file.padEnd(28)} ${f.w}x${f.h}  ${f.note}`);
}

if (renders) console.log(`\n${renders} images rendered in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${OUT}`);
