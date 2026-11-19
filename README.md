# \_SOCIAL — the daily posting robot for the 8 SA trade brands

One folder. No npm install, no API keys required to start, no cost per post.
It generates the content, renders the images, and posts on a schedule.

Read **MONEY-STACK.md** first — it is the business plan this machine serves.
This file is the manual.

---

## What it does

```
_BRAND/brands.json          colour, glyph, tagline     ─┐
social.config.json          bios, hashtags, CTA, angles ├─→ engine.mjs ─→ queue.jsonl
<site>/data/services.json   real services + price bands │                    │
<site>/data/geo-meta.json   118 real Gauteng suburbs   ─┘                    │
                                                            assets.mjs ──────┤
                                                        (renders the cards)  │
                                                              post.mjs ──────┘
                                                        (sends on 10 channels)
```

**175,584 unique posts** are available from the data the sites already own —
over twenty years at 24 posts a day. No model tokens are spent per post, so
the content bill is permanently R0.

---

## First run, in order

```bash
cd "C:/Users/acewu/Desktop/SRARTER/_SOCIAL"
```

```bash
node selftest.mjs
```

```bash
node assets.mjs --static
```

```bash
node engine.mjs --days=90
```

```bash
node post.mjs --dry
```

`--static` writes `out/<domain>/identity/` — avatar, Facebook cover, X header,
LinkedIn banner, YouTube art, WhatsApp DP, plus `PROFILE-COPY.txt` with the bio,
handle, hashtag set, subreddits and brand hex codes for that brand. Upload those
to the platforms once and never touch them again.

---

## Every command

| Command | What it does |
|---|---|
| `node engine.mjs --audit` | how many unique posts each brand can produce |
| `node engine.mjs --sample` | print three finished posts, long and short |
| `node engine.mjs --days=90` | build/rebuild `queue.jsonl` |
| `node assets.mjs --list` | every image format and its platform |
| `node assets.mjs --static` | identity pack for all 8 brands |
| `node assets.mjs --static --only=sapoolpros.co.za` | one brand |
| `node assets.mjs --posts --date=2026-11-20` | render that day's post cards |
| `node post.mjs --status` | which channels are armed, which need keys |
| `node post.mjs --dry` | show what would go out today, send nothing |
| `node post.mjs` | send today's posts |
| `node post.mjs --only=telegraph,facebook` | send on named channels only |
| `node selftest.mjs` | 9 checks over copy quality and queue integrity |
| `node leadbuyers.mjs` | outreach pack per trade — who pays, the searches, the message, the rate card |
| `node ../EMPIRE/set-phone.mjs --check` | which surfaces publish a fake number |
| `node ../EMPIRE/set-phone.mjs 082 345 6789` | put one real number into all 10 files at once |

### The phone number switch

While `network.whatsapp` is `REPLACE_WITH_27XXXXXXXXX`, every post's CTA points at the
quote page. The moment a real `27XXXXXXXXX` is in there, every post switches its primary
CTA to a prefilled `wa.me` link naming the service, the suburb and the channel — so each
lead arrives self-identifying and routable without a clarifying question. X gets one link
instead of two, because it charges 23 characters per URL.

`set-phone.mjs` writes that number into all seven WordPress configs, the solar
`data.mjs`, this config and the empire ledger in one command, backs up every file as
`*.bak-phone`, and deploys nothing — it prints the rebuild commands for you to review.

---

## Channels

Three work the moment you run it, with no account and no key:

| Channel | Status | Notes |
|---|---|---|
| **telegraph** | works now | telegra.ph, no signup, indexable, 2/day |
| **writeas** | works now | write.as anonymous post, 1/day |
| **gbp** | works now | writes `out/_gbp-manual/<date>-<domain>.md` — paste into Google Business Profile by hand |

Seven more wake up on their own the moment the matching environment variables exist.
No code changes, no redeploy:

| Channel | Environment variables |
|---|---|
| telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| facebook | `FB_PAGE_ID`, `FB_PAGE_TOKEN` |
| instagram | `IG_USER_ID`, `FB_PAGE_TOKEN`, `ASSET_BASE` |
| pinterest | `PINTEREST_TOKEN`, `PINTEREST_BOARD_ID`, `ASSET_BASE` |
| devto | `DEVTO_API_KEY` |
| reddit | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`, `REDDIT_SUBREDDIT` |
| x | `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` |

A channel with no keys is skipped with a one-line reason. It never fails the run.

**Google Business Profile is the manual one, and it is the one that makes the
most money.** Google does not give a free write API. The engine does everything
except the paste. For a local trade in Gauteng, a daily GBP post outperforms
every other channel in this list combined. It is sixty seconds a day.

---

## Running it daily for free

`.github/workflows/daily-social.yml` is ready to go.

1. Make `_SOCIAL/` a **public** GitHub repo — public repos get unlimited free
   Actions minutes; private gets 2,000/month and this run costs 3–6 minutes a day.
2. Add whichever keys you have under **Settings → Secrets and variables → Actions**.
3. That is it. It runs at 08:00 and 17:00 SAST, tops the queue up automatically
   when it drops under 14 days, renders the cards, commits them, posts, and writes
   the day's GBP paste file into the Actions run summary.

`ASSET_BASE` is set by the workflow to your own repo's `raw.githubusercontent.com`
URL, which is a free image CDN. Instagram and Pinterest both require a public
image URL — this is how they get one without you paying for hosting.

---

## Editing the content

Everything marketing-facing lives in `social.config.json`:

- `brands.<domain>.hashtags` — rotated 5 per post, never all at once
- `brands.<domain>.checks` — the "what to ask before booking" bank
- `brands.<domain>.mistakes` — the "what goes wrong" bank
- `brands.<domain>.seasonalHooks` — per-month angle for that trade
- `platforms.<name>.perDay` — posting volume per channel
- `archetypes.<name>.weight` — the content mix

Add a service to a site's `data/services.json` and it enters the rotation on the
next queue build. Add a suburb to `geo-meta.json` and every service gains another
118th of a city.

**After any edit: `node selftest.mjs`.** It catches template leakage, double
spaces, over-length X posts, duplicate queue IDs and one brand hogging a day.

---

## Rules the engine enforces for you

From `social.config.json → network.voiceRules`:

- Prices are bands, never promises — always "about" or "from".
- Never claim a job that was not done. No invented reviews, no fake before-and-after.
- One ask per post.
- Name the suburb, name the price, name what is included.

Every post carries a real price band from the site's own data and a real suburb
profile. That is what makes it rank and what makes it convert — and it is the
reason this is a marketing engine rather than a spam cannon.

---

## Known limits

- `sasolarhub.co.za` is a static build with no `data/services.json`, so its 12
  services live in `social.config.json → brands.sasolarhub.co.za.servicesFallback`.
  Update them there when prices move.
- `x` free tier is 500 posts a month across the whole network. At 2/day you are
  at 60. Raise `perDay` carefully.
- Reddit links without a reputation get removed and can get the account banned.
  Comment genuinely in a sub for two weeks before the robot posts to it. The
  `REDDIT_SUBREDDIT` variable is deliberately not set by default.
- Image posts fall back to text when `ASSET_BASE` is unset, rather than failing.
- **write.as is currently unreachable from this machine** — `UND_ERR_CONNECT_TIMEOUT`
  on the whole domain, not just the API, while telegra.ph answers in under a second.
  The adapter is fine; the route is not. It may be the ISP, or write.as may be down.
  Retry from another network before changing any code. If it stays dead, set
  `platforms.writeas.perDay` to `0` and the channel drops out silently.
- A post that fails is **not** marked as sent — it stays in the queue and is retried on
  the next run. After three failed attempts it retires, so a permanently dead channel
  cannot clog the queue forever. Successes are never re-sent.
