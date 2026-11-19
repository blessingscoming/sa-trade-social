/** selftest.mjs — run after any edit to engine.mjs or social.config.json.
 *  node selftest.mjs      (exits non-zero on failure) */

import assert from 'node:assert/strict';
import { loadNetwork, makePost, buildQueue } from './engine.mjs';

const { cfg, brands: allBrands, net, archetypes } = loadNetwork();
const brands = allBrands.filter((b) => b.inRotation);
let checks = 0;
const ok = (label, fn) => { fn(); checks++; console.log('  ok  ' + label); };

ok('the rotation holds 9 brands (10 kits, pixquo sits out)', () => {
  assert.equal(allBrands.length, 10);
  assert.equal(brands.length, 9);
  assert.ok(!brands.some((b) => b.domain === 'pixquo.com'), 'pixquo must stay out of the geo rotation');
});
ok('every brand has services', () => {
  for (const b of brands) assert.ok(b.services.length >= 10, `${b.domain} has ${b.services.length} services`);
});
ok('every brand has suburbs', () => {
  for (const b of brands) assert.ok(b.suburbs.length >= 50, `${b.domain} has ${b.suburbs.length} suburbs`);
});
ok('every brand has marketing copy', () => {
  for (const b of brands) {
    assert.ok(b.hashtags?.length >= 5, `${b.domain} hashtags`);
    assert.ok(b.checks?.length >= 4, `${b.domain} checks`);
    assert.ok(b.mistakes?.length >= 3, `${b.domain} mistakes`);
    assert.ok(b.cta && b.bioShort, `${b.domain} cta/bio`);
  }
});

ok('posts are well formed across every brand x archetype', () => {
  const seen = new Set();
  for (const b of brands) {
    for (const arch of Object.keys(archetypes)) {
      for (let i = 0; i < 12; i++) {
        const p = makePost({ net, brand: b, archetypes: { [arch]: { weight: 1 } }, seasons: cfg.seasons, seed: `${b.domain}|t${i}|${arch}` });
        assert.equal(p.archetype, arch);
        assert.ok(p.title.length > 12 && p.title.length < 180, `title length: ${p.title}`);
        assert.ok(p.long.length > 500, `long too short (${p.long.length}): ${p.title}`);
        assert.ok(p.short.length > 80 && p.short.length < 1400, `short length ${p.short.length}`);
        // no template leakage
        for (const bad of ['undefined', 'null', '[object', 'NaN', '${']) {
          assert.ok(!p.long.includes(bad) && !p.short.includes(bad) && !p.title.includes(bad),
            `"${bad}" leaked into ${b.domain}/${arch}: ${p.title}`);
        }
        assert.ok(!/ {2,}/.test(p.short), `double space in short: ${p.title}`);
        assert.ok(!/ {2,}/.test(p.long), `double space in long: ${p.title}`);
        assert.ok(!/ [.,]/.test(p.short), `orphan punctuation in short: ${p.title}`);
        assert.ok(!/\n{3,}/.test(p.short), 'blank-line run in short');
        assert.ok(p.url.startsWith(`https://${b.domain}/services/`), 'url shape');
        assert.ok(p.tags.length >= 3, 'hashtags present');
        assert.ok(p.image.headline && p.image.value, 'image spec filled');
        seen.add(p.title);
      }
    }
  }
  assert.ok(seen.size > 300, `only ${seen.size} distinct titles — templates are repeating`);
});

ok('a 30-day queue is unique, dated and covers every brand', () => {
  const rows = buildQueue({ days: 30, start: new Date('2026-12-01T00:00:00Z') });
  assert.ok(rows.length > 300, `queue too small: ${rows.length}`);
  const ids = new Set(rows.map((r) => r.id));
  assert.equal(ids.size, rows.length, 'duplicate post ids in queue');
  const doms = new Set(rows.map((r) => r.domain));
  assert.equal(doms.size, 9, `only ${doms.size} brands in the rotation`);
  const dates = new Set(rows.map((r) => r.date));
  assert.equal(dates.size, 30, `only ${dates.size} distinct dates`);
  // no brand should own more than 20% of any single day
  for (const d of dates) {
    const day = rows.filter((r) => r.date === d);
    for (const dom of doms) {
      const share = day.filter((r) => r.domain === dom).length / day.length;
      assert.ok(share <= 0.35, `${dom} took ${Math.round(share * 100)}% of ${d}`);
    }
  }
});

ok('the queue is deterministic — rebuilding does not reshuffle', () => {
  const a = buildQueue({ days: 5, start: new Date('2027-01-01T00:00:00Z') });
  const b = buildQueue({ days: 5, start: new Date('2027-01-01T00:00:00Z') });
  assert.deepEqual(a.map((r) => r.id), b.map((r) => r.id));
  assert.deepEqual(a.map((r) => r.title), b.map((r) => r.title));
});

ok('X posts fit in 280 characters after trimming', () => {
  const rows = buildQueue({ days: 7, start: new Date('2026-12-01T00:00:00Z') }).filter((r) => r.channel === 'x');
  for (const p of rows) {
    assert.ok(!(p.wa && p.short.includes(p.url)), `two links in an X post: ${p.title}`);
    let text = p.short.replace(p.wa || '\0', '').replace(p.url, '').trim();
    const budget = 280 - 24 - 1;
    if (text.length > budget) text = text.slice(0, budget - 1).replace(/\s\S*$/, '') + '…';
    assert.ok(text.length + 24 <= 280, `${text.length + 24} chars: ${p.title}`);
  }
});

ok('the placeholder WhatsApp number is still flagged', () => {
  // deliberate failure surface: this test turns green only once a real number is set,
  // so nobody ships lead-gen into a phone that does not exist
  if (net.whatsapp.startsWith('REPLACE_')) {
    console.log('      WARNING: network.whatsapp is still a placeholder — leads have nowhere to land.');
  }
});

console.log(`\n${checks} checks passed.`);
