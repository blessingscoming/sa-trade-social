/**
 * engine.mjs — the content brain of the SA trade social network.
 *
 * Zero model tokens. Every post is assembled from data the sites already own:
 *   _BRAND/brands.json          -> colour, glyph, tagline, brand name
 *   social.config.json          -> bios, hashtags, CTA, mistakes, checks, seasons
 *   <site>/data/services.json   -> 20-28 real services with real price bands
 *   <site>/data/geo-meta.json   -> 118 real Gauteng suburbs with real profiles
 *
 * 8 brands x ~25 services x 118 suburbs x 8 archetypes = ~190,000 unique posts.
 * At 24 posts a day that is over 20 years of content. The constraint is never ideas.
 *
 * Exports: loadNetwork(), makePost(), buildQueue(), rng helpers.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRARTER = path.join(ROOT, '..');

/* ------------------------------------------------------------------ rng -- */
/* FNV-1a. Deterministic: the same (brand, day, slot) always yields the same
   post, so a re-run never double-posts different content and a queue can be
   rebuilt from scratch without losing its place. */

export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
const pick = (arr, seed) => arr[hash(String(seed)) % arr.length];
const pickN = (arr, seed, n) => {
  const out = [];
  const used = new Set();
  for (let i = 0; out.length < Math.min(n, arr.length); i++) {
    const idx = hash(seed + ':' + i) % arr.length;
    if (used.has(idx)) continue;
    used.add(idx);
    out.push(arr[idx]);
  }
  return out;
};

/* ---------------------------------------------------------------- load -- */

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** Where each domain keeps its services.json + geo-meta.json. */
const DATA_DIR = {
  'sacleaningpros.co.za': path.join(SRARTER, '_CLEAN', 'data'),
  'sasolarhub.co.za': null // static build, services come from config.servicesFallback
};
const siteData = (domain) =>
  DATA_DIR[domain] !== undefined ? DATA_DIR[domain] : path.join(SRARTER, '_SITES', domain, 'data');

/** Any site's geo-meta works as the Gauteng suburb list — same metro, same market. */
function anySuburbs(brands) {
  for (const b of brands) if (b.suburbs.length) return b.suburbs;
  return [];
}

export function loadNetwork() {
  const cfg = readJson(path.join(ROOT, 'social.config.json'));
  const brandFile = readJson(path.join(SRARTER, '_BRAND', 'brands.json'));

  const brands = brandFile.brands.map((b) => {
    const sc = cfg.brands[b.domain] || {};
    // A brand only enters the daily rotation once it has a marketing block in
    // social.config.json. pixquo.com deliberately has none: it is a global
    // digital store, and the suburb-driven templates would post nonsense for it.
    const inRotation = !!cfg.brands[b.domain];
    const dir = siteData(b.domain);

    let services = [];
    let suburbs = [];
    if (dir && fs.existsSync(path.join(dir, 'services.json'))) {
      services = readJson(path.join(dir, 'services.json'))
        .filter((s) => s.name && s.priceBand)
        .map((s) => ({
          slug: s.slug,
          name: s.name,
          group: s.group || '',
          h1: s.h1 || '',
          priceBand: s.priceBand,
          priceBasis: s.priceBasis || '',
          priceNotes: s.priceNotes || '',
          meta: s.metaDescription || ''
        }));
    }
    if (!services.length && sc.servicesFallback) {
      services = sc.servicesFallback.map((s) => ({
        slug: s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        name: s.name,
        group: '',
        h1: '',
        priceBand: s.priceBand,
        priceBasis: '',
        priceNotes: s.note || '',
        meta: s.note || ''
      }));
    }
    if (dir && fs.existsSync(path.join(dir, 'geo-meta.json'))) {
      const g = readJson(path.join(dir, 'geo-meta.json'));
      const src = g.suburbs || g;
      suburbs = Object.entries(src).map(([slug, v]) => ({
        slug,
        name: v.name || slug,
        metro: v.metro || '',
        municipality: v.municipality || '',
        housing: v.housing || '',
        profile: v.profile || '',
        landmarks: v.landmarks || []
      }));
    }

    return {
      ...b,
      ...sc,
      domain: b.domain,
      inRotation,
      services,
      suburbs,
      assetDir: path.join(SRARTER, '_BRAND', 'out', b.domain)
    };
  });

  const fallbackSuburbs = anySuburbs(brands);
  for (const b of brands) if (!b.suburbs.length) b.suburbs = fallbackSuburbs;

  return { cfg, brands, net: cfg.network, platforms: cfg.platforms, archetypes: cfg.archetypes };
}

/* ----------------------------------------------------------- templates -- */

const HOOKS = {
  price: [
    (s, g) => `What ${low(s.name)} actually costs in ${g.name}`,
    (s, g) => `${s.name} in ${g.name}: the price band, before anyone visits`,
    (s, g) => `${g.name} pricing: ${low(s.name)}, ${s.priceBand}`,
    (s, g) => `Budgeting ${low(s.name)} in ${g.name}? Start here`
  ],
  checklist: [
    (s, g) => `Five things to check before you book ${low(s.name)}`,
    (s, g) => `Before you pay a deposit on ${low(s.name)}, check these`,
    (s) => `The ${low(s.name)} checklist most people skip`,
    (s, g) => `Booking ${low(s.name)} in ${g.name}? Ask these five questions`
  ],
  mistake: [
    (s) => `The expensive mistake people make with ${low(s.name)}`,
    (s, g) => `What goes wrong with ${low(s.name)} in ${g.name}, and what it costs`,
    (s) => `We fix this ${low(s.name)} mistake every single week`,
    (s) => `Three ways ${low(s.name)} quietly costs you double`
  ],
  suburb: [
    (s, g) => `${g.name}: why ${low(s.name)} comes up here more than most suburbs`,
    (s, g) => `${g.name} homes and ${low(s.name)}: what the area actually needs`,
    (s, g) => `Working in ${g.name}: ${low(s.name)}, priced for the housing stock`
  ],
  faq: [
    (s, g) => `"How much is ${low(s.name)} in ${g.name}?" — a straight answer`,
    (s) => `The question we get asked most about ${low(s.name)}`,
    (s, g) => `${g.name}: your ${low(s.name)} questions, answered without a sales call`
  ],
  compare: [
    (a, b) => `${a.name} or ${b.name}? When each one wins`,
    (a, b) => `${a.name} vs ${b.name}: the honest price comparison`,
    (a, b) => `Choosing between ${low(a.name)} and ${low(b.name)}`
  ],
  seasonal: [
    (s, g, sea) => `${cap(sea)} in ${g.name}: get ${low(s.name)} done now`,
    (s, g, sea) => `It is ${sea}. That changes what ${low(s.name)} costs you`,
    (s, g, sea) => `${g.name}, ${sea}: the ${low(s.name)} window is open`
  ],
  offer: [
    (s, g) => `${s.name} in ${g.name} — published prices, free quote`,
    (s, g) => `Need ${low(s.name)} in ${g.name}? Price band first, quote second`
  ]
};

/** Lowercase the first word only when it is an ordinary Capitalised word.
 *  Leaves acronyms and part-caps intact: "CoC Repairs" must not become "coC". */
const low = (s) => {
  const str = String(s);
  const [first, ...rest] = str.split(/\s/);
  const ordinary = /^[A-Z][a-z]+$/.test(first || '');
  // leave Title Case product names alone — "water Filtration Systems" reads broken
  const restHasCaps = /[A-Z]/.test(rest.join(' '));
  return ordinary && !restHasCaps ? str.charAt(0).toLowerCase() + str.slice(1) : str;
};
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const strip = (s) => String(s).replace(/\s+/g, ' ').trim();
/** Price band with any leading hedge removed, for sentences that supply their own. */
const bare = (s) => String(s).replace(/^(from\s+about|about|from)\s+/i, '');

/* -------------------------------------------------------------- bodies -- */

function longBody(a) {
  const { brand, service: s, suburb: g, second, archetype, season, url, checks, mistakes, wa } = a;
  const P = [];
  const sig = () =>
    `${brand.brand} publishes a price band for every service, so you can budget ${low(s.name)} before anyone sets foot on the property. Full list and a free quote: ${url}` +
    (wa ? `\n\nOr send one WhatsApp and skip the form — it arrives already saying which job and which suburb: ${wa}` : '');

  if (archetype === 'price') {
    P.push(
      `If you are pricing ${low(s.name)} in ${g.name}, the number you want is ${s.priceBand}. That is a band, not a promise — but it is a real band, published up front, and it is close enough to budget against.`,
      s.priceNotes ? `How that number is derived: ${strip(s.priceNotes)}` : '',
      s.priceBasis ? `It is quoted ${strip(s.priceBasis)}, which matters: two quotes on different bases are not comparable, however similar the rand figure looks.` : '',
      `${g.name} specifics. ${strip(g.profile || '')} Housing here is mostly ${strip(g.housing || 'standard suburban')}, and that drives the final figure more than anything a call centre will tell you.`,
      s.h1 ? `What we are actually talking about: ${strip(s.h1)}.` : strip(s.meta),
      `Where quotes go wrong`,
      mistakes.map((m) => `- ${cap(m)}`).join('\n'),
      `What to confirm before you pay anything`,
      checks.map((c) => `- ${cap(c)}`).join('\n'),
      sig()
    );
  } else if (archetype === 'checklist') {
    P.push(
      `${s.name} in ${g.name} runs ${s.priceBand}. Most of the money people lose on it is not lost on the price — it is lost in what nobody agreed before the work started.`,
      `Five things to confirm, in writing, first:`,
      checks.map((c, i) => `${i + 1}. ${cap(c)}`).join('\n'),
      s.priceNotes ? `Context on the pricing: ${strip(s.priceNotes)}` : '',
      `${g.name} is mostly ${strip(g.housing || 'standard suburban housing')}${g.landmarks?.length ? `, around ${g.landmarks.slice(0, 2).join(' and ')}` : ''}. Ask how your specific property changes the band — a good contractor can answer that in one sentence.`,
      sig()
    );
  } else if (archetype === 'mistake') {
    P.push(
      `We get called out to the same ${low(s.name)} problems over and over in ${g.name}. They are not exotic. They are cheap to avoid and expensive to fix.`,
      mistakes.map((m, i) => `${i + 1}. ${cap(m)}`).join('\n'),
      `Each one of those turns a job of ${bare(s.priceBand)} into a bigger one. ${s.priceNotes ? strip(s.priceNotes) : ''}`,
      `The fix is boring: ask for the scope in writing, ask what the price is based on, and ask who carries the guarantee.`,
      checks.slice(0, 3).map((c) => `- ${cap(c)}`).join('\n'),
      sig()
    );
  } else if (archetype === 'suburb') {
    P.push(
      `${g.name} sits in ${g.metro || g.municipality || 'Gauteng'}. ${strip(g.profile || '')}`,
      `Housing here is mostly ${strip(g.housing || 'standard suburban')}, which is exactly why ${low(s.name)} comes up as often as it does in this area.`,
      `The band for ${low(s.name)} is ${s.priceBand}. ${s.priceBasis ? `Quoted ${strip(s.priceBasis)}.` : ''} ${s.priceNotes ? strip(s.priceNotes) : ''}`,
      g.landmarks?.length ? `We work the area around ${g.landmarks.join(', ')} and the suburbs next to it.` : '',
      `What to check before booking in ${g.name}:`,
      checks.slice(0, 4).map((c) => `- ${cap(c)}`).join('\n'),
      sig()
    );
  } else if (archetype === 'faq') {
    P.push(
      `Short answer: ${s.priceBand}.`,
      `Long answer, because the short one hides the part that matters. ${s.priceBasis ? `The job is priced ${strip(s.priceBasis)}.` : ''} ${s.priceNotes ? strip(s.priceNotes) : ''}`,
      s.h1 ? strip(s.h1) + '.' : strip(s.meta),
      `In ${g.name} specifically, the housing is mostly ${strip(g.housing || 'standard suburban')}, so the band tends to sit where you would expect rather than at either extreme.`,
      `The follow-up questions worth asking:`,
      checks.slice(0, 4).map((c) => `- ${cap(c)}`).join('\n'),
      `And the things that push a quote up unexpectedly: ${mistakes.slice(0, 2).map(low).join('; ')}.`,
      sig()
    );
  } else if (archetype === 'compare' && second) {
    P.push(
      `Two ways to spend money on the same problem in ${g.name}, and they are not interchangeable.`,
      `${s.name} — ${s.priceBand}. ${s.h1 ? strip(s.h1) + '.' : strip(s.meta)}`,
      `${second.name} — ${second.priceBand}. ${second.h1 ? strip(second.h1) + '.' : strip(second.meta)}`,
      `When the first one wins: when the scope is clear, the property is standard for ${g.name}, and you want the smaller number to actually hold.`,
      `When the second one wins: when the first option would need to be redone inside two years, which is the only comparison that matters.`,
      `Either way, confirm these before you choose:`,
      checks.slice(0, 3).map((c) => `- ${cap(c)}`).join('\n'),
      sig()
    );
  } else if (archetype === 'seasonal') {
    P.push(
      `It is ${season} in Gauteng. That is not small talk — it changes both the price and the queue for ${low(s.name)}.`,
      `The band right now is ${s.priceBand}. ${s.priceNotes ? strip(s.priceNotes) : ''}`,
      `In ${g.name}, with housing that is mostly ${strip(g.housing || 'standard suburban')}, the seasonal pattern is predictable enough to plan around. Booking inside the window costs less than booking in the rush, every year.`,
      `What to sort out before the season turns:`,
      checks.slice(0, 4).map((c) => `- ${cap(c)}`).join('\n'),
      `What not to do: ${mistakes.slice(0, 2).map(low).join('; ')}.`,
      sig()
    );
  } else {
    P.push(
      `${s.name} in ${g.name}: ${s.priceBand}.`,
      s.h1 ? strip(s.h1) + '.' : strip(s.meta),
      s.priceNotes ? strip(s.priceNotes) : '',
      `Why the price is published. Most trades in Gauteng quote only after a site visit, which makes comparing three quotes a week-long job. We publish the band first so you can decide whether the project is worth starting before anyone books your Saturday.`,
      `${g.name} at a glance. ${strip(g.profile || '')} Housing is mostly ${strip(g.housing || 'standard suburban')}${g.landmarks?.length ? `, around ${g.landmarks.slice(0, 2).join(' and ')}` : ''}.`,
      `What a straight quote from anyone should include:`,
      checks.map((c) => `- ${cap(c)}`).join('\n'),
      `And what quietly inflates one: ${mistakes.map(low).join('; ')}.`,
      `${brand.tagline}`,
      sig()
    );
  }

  return P.filter(Boolean)
    .map((s) => String(s).replace(/[ \t]+/g, ' ').replace(/ ([.,;])/g, '$1').trim())
    .filter(Boolean)
    .join('\n\n');
}

function shortBody(a) {
  const { brand, service: s, suburb: g, second, archetype, season, url, checks, mistakes, tags, wa } = a;
  // WhatsApp outperforms a form in SA trade by a wide margin, so when a real
  // number exists it becomes the primary ask and the website drops to second.
  // X counts every link as 23 characters, so it gets one link, not two.
  const oneLink = a.channel === 'x';
  const cta = wa
    ? oneLink
      ? `${brand.cta || 'Get a quote'} on WhatsApp: ${wa}`
      : `${brand.cta || 'Get a quote'} on WhatsApp: ${wa}\nOr see every price: ${url}`
    : `${brand.cta || 'Get a quote'}: ${url}`;
  const lines = [];

  switch (archetype) {
    case 'price':
      lines.push(`${s.name} in ${g.name}: ${s.priceBand}.`, '', `Published band, not a phone-call number. ${s.priceBasis ? `Priced ${strip(s.priceBasis)}.` : ''}`, '', cta);
      break;
    case 'checklist':
      lines.push(`Before you book ${low(s.name)} in ${g.name}:`, '', ...checks.slice(0, 4).map((c) => `• ${cap(c)}`), '', `Band: ${s.priceBand}.`, cta);
      break;
    case 'mistake':
      lines.push(`The ${low(s.name)} mistake that costs the most:`, '', `${cap(mistakes[0])}.`, '', `Band for the job done properly: ${s.priceBand}.`, cta);
      break;
    case 'suburb':
      lines.push(`${g.name} — ${strip((g.profile || '').split('.')[0])}.`, '', `${s.name}: ${s.priceBand}.`, cta);
      break;
    case 'faq':
      lines.push(`"How much is ${low(s.name)} in ${g.name}?"`, '', `${s.priceBand}. ${s.priceBasis ? `Priced ${strip(s.priceBasis)}.` : ''}`, '', `No call needed to find that out.`, cta);
      break;
    case 'compare':
      lines.push(`${s.name}: ${s.priceBand}`, `${second ? second.name + ': ' + second.priceBand : ''}`, '', `Same problem, two budgets. Pick on what gets redone in two years, not on the smaller number.`, cta);
      break;
    case 'seasonal':
      lines.push(`${cap(season)} in ${g.name}.`, '', `${s.name} — ${s.priceBand}. Booking inside the window beats booking in the rush.`, cta);
      break;
    default:
      lines.push(`${s.name} in ${g.name} — ${s.priceBand}.`, '', brand.tagline, cta);
  }
  lines.push('', tags.join(' '));
  // conditional fragments leave double spaces and trailing space — clean per line
  return lines
    .filter((l) => l !== undefined)
    .map((l) => String(l).replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/* ---------------------------------------------------------- make a post -- */

const WEIGHTED = (archetypes) => {
  const bag = [];
  for (const [k, v] of Object.entries(archetypes)) for (let i = 0; i < (v.weight || 1); i++) bag.push(k);
  return bag;
};

/**
 * Build one fully-formed post.
 * @param {object} o  { net, brand, archetypes, seasons, seed, channel, date }
 */
export function makePost({ net, brand, archetypes, seasons, seed, channel = 'telegraph', date = new Date() }) {
  if (!brand.services.length) throw new Error(`${brand.domain}: no services data`);
  const bag = WEIGHTED(archetypes);
  const archetype = pick(bag, seed + ':arch');
  const service = pick(brand.services, seed + ':svc');
  const suburb = pick(brand.suburbs, seed + ':sub');
  const second = brand.services.length > 1
    ? pick(brand.services.filter((x) => x.slug !== service.slug), seed + ':svc2')
    : null;

  const month = String(date.getMonth() + 1);
  const season = (brand.seasonalHooks && brand.seasonalHooks[month]) || seasons[month] || 'this season';

  const checks = pickN(brand.checks || [], seed + ':chk', 5);
  const mistakes = pickN(brand.mistakes || [], seed + ':mis', 3);
  const tags = pickN(brand.hashtags || [], seed + ':tag', 5);

  const utm = (net.quoteUtm || '').replace('{channel}', channel);
  const url = `https://${brand.domain}/services/${service.slug}/${utm}`;

  // A prefilled wa.me link makes every lead self-identifying: the message that
  // lands already names the service, the suburb and which site sent it, so it
  // can be routed to the right buyer without a single clarifying question.
  const waNumber = String(net.whatsapp || '');
  const wa = /^27\d{9}$/.test(waNumber)
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        `Hi ${brand.brand}, I'd like a quote for ${service.name} in ${suburb.name}. (via ${channel})`
      )}`
    : null;

  const hookSet = HOOKS[archetype] || HOOKS.price;
  const hookFn = pick(hookSet, seed + ':hook');
  const title = archetype === 'compare' && second
    ? hookFn(service, second)
    : archetype === 'seasonal'
      ? hookFn(service, suburb, season)
      : hookFn(service, suburb);

  const ctx = { brand, service, suburb, second, archetype, season, url, checks, mistakes, tags, net, wa, channel };

  return {
    domain: brand.domain,
    brandName: brand.brand,
    archetype,
    service: service.slug,
    serviceName: service.name,
    priceBand: service.priceBand,
    suburb: suburb.slug,
    suburbName: suburb.name,
    channel,
    title: strip(title),
    long: longBody(ctx),
    short: shortBody(ctx),
    tags,
    url,
    wa,
    image: {
      template: archetype === 'price' || archetype === 'faq' ? 'price-card' : archetype === 'checklist' ? 'checklist-card' : 'statement-card',
      headline: strip(title),
      kicker: suburb.name,
      value: service.priceBand,
      bullets: checks.slice(0, 4),
      domain: brand.domain
    },
    seed
  };
}

/* --------------------------------------------------------------- queue -- */

const iso = (d) => d.toISOString().slice(0, 10);

/**
 * Build a dated posting queue.
 * Rotates brands so no brand posts twice in a row on the same channel, and
 * respects each platform's perDay cap across the whole network.
 */
export function buildQueue({ days = 90, start = new Date(), onlyChannels = null } = {}) {
  const { cfg, brands, net, platforms, archetypes } = loadNetwork();
  const usable = brands.filter((b) => b.inRotation && b.services.length);
  const chans = Object.entries(platforms).filter(
    ([k]) => !onlyChannels || onlyChannels.includes(k)
  );
  const rows = [];

  for (let d = 0; d < days; d++) {
    const date = new Date(start.getTime() + d * 86400000);
    const day = iso(date);
    let slot = 0;
    for (const [channel, p] of chans) {
      for (let i = 0; i < (p.perDay || 1); i++) {
        // rotate the brand pointer across the whole network, not per channel,
        // so every brand gets even exposure on every surface over time
        const brand = usable[(d * 7 + slot) % usable.length];
        const seed = `${brand.domain}|${day}|${channel}|${i}`;
        const post = makePost({ net, brand, archetypes, seasons: cfg.seasons, seed, channel, date });
        rows.push({
          id: hash(seed).toString(36) + slot.toString(36),
          date: day,
          channel,
          kind: p.kind,
          needsAuth: !!p.needsAuth,
          status: 'pending',
          ...post
        });
        slot++;
      }
    }
  }
  return rows;
}

export function writeQueue(rows, file = path.join(ROOT, 'queue.jsonl')) {
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return file;
}

export function readQueue(file = path.join(ROOT, 'queue.jsonl')) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

/* ----------------------------------------------------------------- cli -- */

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const days = Number((args.find((a) => a.startsWith('--days=')) || '').split('=')[1] || 90);

  if (args.includes('--audit')) {
    const { brands } = loadNetwork();
    let total = 0;
    for (const b of brands) {
      const combos = b.services.length * b.suburbs.length * 8;
      total += combos;
      console.log(
        `${b.domain.padEnd(30)} services=${String(b.services.length).padStart(3)}  suburbs=${String(b.suburbs.length).padStart(4)}  unique posts=${combos.toLocaleString()}`
      );
    }
    console.log(`\nNetwork content ceiling: ${total.toLocaleString()} unique posts.`);
    process.exit(0);
  }

  if (args.includes('--sample')) {
    const { cfg, brands, net, archetypes } = loadNetwork();
    for (const b of brands.filter((x) => x.services.length).slice(0, 3)) {
      const p = makePost({ net, brand: b, archetypes, seasons: cfg.seasons, seed: b.domain + '|sample' });
      console.log('\n' + '='.repeat(78));
      console.log(`${p.brandName}  ·  ${p.archetype}  ·  ${p.suburbName}`);
      console.log('TITLE: ' + p.title);
      console.log('\n--- SHORT ---\n' + p.short);
      console.log('\n--- LONG (first 600) ---\n' + p.long.slice(0, 600) + '…');
    }
    process.exit(0);
  }

  const rows = buildQueue({ days });
  const file = writeQueue(rows);
  const byChan = {};
  for (const r of rows) byChan[r.channel] = (byChan[r.channel] || 0) + 1;
  console.log(`Queued ${rows.length} posts over ${days} days -> ${file}`);
  console.log(Object.entries(byChan).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
}
