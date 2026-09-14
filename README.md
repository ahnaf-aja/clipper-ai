# Clipper AI

Turn any YouTube video into viral short-form clips. Paste a link, and the pipeline
transcribes the video, analyses the discourse, finds the self-contained moments worth
publishing, scores them, captions them, and exports them as 9:16 / 1:1 / 16:9 video.

Built as a real application: Next.js 15 App Router, TypeScript end to end, Prisma +
SQLite, session auth, a job queue with retries, server-sent progress streaming, and a
browser-side preview editor.

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

Generate a secret and paste it into `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

```bash
npm run setup
```

```bash
npm run dev
```

Open http://localhost:3000. The seed creates a demo account:

- **email** `demo@clipper.ai`
- **password** `demo1234`

Nothing else is required — no API keys, and ffmpeg/yt-dlp install themselves. Paste a
YouTube link on `/generate` and the full flow runs through to a downloadable MP4.

---

## What actually happens when you paste a link

| # | Stage | Implementation |
|---|-------|----------------|
| 1–3 | Metadata, thumbnail, duration | YouTube oEmbed + the InnerTube player endpoint. Real data, no API key. |
| 4–5 | Download + audio extraction | `yt-dlp` → H.264 mp4, `ffmpeg` → 16 kHz mono WAV. Deferred to export time unless ASR needs the audio. |
| 6–7 | Speech-to-text | Whisper `large-v3-turbo` with the language pinned → YouTube's timed-text in the *spoken* language → fail. Never a translation, never invented. |
| 8 | Discourse analysis | Claude via `ANTHROPIC_API_KEY` when set; otherwise the local analyser. |
| 9 | Segmentation | TextTiling-style lexical-cohesion valley detection over sentence windows. |
| 10 | Scoring | Eleven semantic signals × measured prosody × structural completeness. |
| 11 | Selection | Greedy pick with a 35% overlap ceiling and per-plan clip caps. |
| 12–13 | Subtitles + viral captions | Word-level cue building, emphasis, keyword colouring, emoji. |
| 14–15 | Render + preview | `ffmpeg` burn-in via generated ASS when available; browser compositor otherwise. |
| 16 | AI insight | Per-project report: best clip, why, retention/engagement/share predictions. |

Every stage writes to a live log that streams to the Generate page over SSE.

## Transcript accuracy

Subtitles are only as good as the transcript, so this is the part that got the most
measurement. **Nothing is ever invented**: if no faithful transcript can be produced, the
job fails rather than putting words on screen that nobody said.

### Pick the spoken language

The Generate page has a **Language** control — *Auto-detect*, *Bahasa Indonesia*, or
*English* — and a **Transcript** source control.

Language detection reads only the first ~30 seconds, which regularly mislabels Indonesian
and code-switched speech. Selecting the language pins the recogniser to it, which is the
single cheapest accuracy win available. The choice is stored per project and shown on the
project page as `ID selected` vs `ID detected 87%`.

### Which engine, and why

Measured on 80 s of casual Indonesian speech (CPU, int8), transcribing the same audio:

| Engine | Speed | Confidence | Result |
|--------|-------|-----------|--------|
| YouTube auto-captions | instant | 0 reported | `xboyfriendfriend`, `kanwan`, `Harry Muire` |
| Whisper `small` | 1.2× realtime | 0.66 | `Buter coin`, `Wased`, dropped ~25% of words |
| Whisper `medium` | 3.7× realtime | 0.71 | accurate, but hours for a long video |
| **Whisper `large-v3-turbo`** | **0.45× realtime** | **0.74** | `muter koin`, `Harry Maguire`, `Messi` — correct, punctuated |

Turbo is both the most accurate *and* the fastest, so it is the default. It is a ~1.6 GB
download on first use.

YouTube's own track remains available and is used automatically when no Whisper engine is
installed. It is fast and needs no audio download, but its Indonesian recogniser makes
real errors — and it reports `acAsrConf: 0` on the segments it gets wrong.

### Never a translation

A popular video can carry 28 caption tracks, nearly all community translations. Picking
the wrong one would caption the video with words nobody spoke, in another language
entirely.

The auto-generated (`asr`) track is produced from the audio, so its language code *is* the
spoken language — that is the anchor. Only tracks in that language are ever accepted; a
translation is never used as "the transcript". If no track exists in the target language,
the source is rejected rather than substituted.

### Source order

1. **Whisper** on the real audio — default, and the only source that adds punctuation.
   Only the audio is downloaded here, not the video.
2. **YouTube timed-text** in the spoken language — fallback when Whisper is unavailable,
   or chosen deliberately to skip the audio download.
3. **Failure** — with an actionable message. Set `ALLOW_SIMULATED_TRANSCRIPT=true` to get
   an invented transcript instead; it is labelled in red in the UI and in the job log as
   not matching the audio. Leave it off.

Every transcript records its provenance — engine, model, whether the language was forced,
language confidence and mean per-word confidence — and all of it is shown on the project
page. A run with low word confidence says so instead of quietly shipping bad subtitles.

### Media toolchain

`npm install` sets this up for you — no manual installs:

- **ffmpeg / ffprobe** come from the `ffmpeg-static` and `ffprobe-static` packages.
- **yt-dlp** is fetched from its GitHub releases into `./bin` by a postinstall script.
  It is not vendored because YouTube changes its player constantly and yt-dlp has to
  stay current. Re-run it any time with `npm run install:ytdlp`.

Binary lookup order is: explicit path in `.env` → bundled binary → whatever is on `PATH`,
so a system-wide install still wins if you point `.env` at it.

If the yt-dlp download is blocked (offline, proxy, firewall), the install does **not**
fail — the app degrades to the fallback below and `GET /api/health` reports what is
actually present.

### Speech-to-text

Whisper is the default transcript engine (see **Transcript accuracy** below). It needs
Python with `faster-whisper`:

```bash
pip install faster-whisper
```

Any interpreter on `PATH` is detected automatically; set `PYTHON_PATH` to pin a specific
one. Without it the app falls back to YouTube's caption track.

Models are cached in your home directory and are 0.5–3 GB. If that drive is short on
space, point `WHISPER_CACHE_DIR` at a roomier one — a mid-download disk-full error is
reported as a plain-English message rather than an OS error code.

`WHISPER_DEVICE=cuda` is roughly 10× faster if you have an NVIDIA GPU.

### Still optional

| Install | Unlocks |
|---------|---------|
| `OPENAI_API_KEY` | Whisper via API instead of locally |
| `ANTHROPIC_API_KEY` | LLM discourse analysis instead of the local analyser |

### When are videos downloaded?

The **video** is never downloaded during analysis — it is fetched lazily on the first
export of a project and reused for every export after that.

The **audio** is downloaded during analysis when Whisper will run (the default), because
transcription needs it. That is a fraction of the bytes of the video. Choosing the
*YouTube captions* transcript source skips even that.

**Fallback:** if ffmpeg is genuinely unavailable, an export produces a portable package
instead — an edit-decision manifest (source, in/out points, output spec, caption data)
plus a WebVTT file. If ffmpeg *is* present but the source cannot be fetched, the export
**fails with an error** rather than quietly handing back a manifest that looks like a
broken download.

---

## Clip rules

These are enforced in code (`src/core/domain/clip-rules.ts`), not left to the model:

- Duration between **20 s** and **5 min**, strongly preferring **30–90 s**.
- Boundaries snap onto sentence edges from the word-level timings — a clip never starts
  or ends mid-sentence.
- **Smart Clip**: the start may move up to 45 s earlier to include the context that makes
  a payoff land, and the end up to 20 s later to complete a thought. If the punchline is
  at 10:32, the clip starts at 09:58 on purpose.
- Model-proposed timestamps are re-snapped and re-validated locally; anything out of
  range is dropped rather than trusted.
- No two selected clips overlap by more than 35%.

## Output templates

A template decides where the video sits in the frame, what fills the space around it,
and where the subtitles go — and **nothing else**. The clip's in/out points, its manual
scenes and its caption data are untouched, so switching template is free: no re-analysis,
no cue rebuild, no lost edits. Cue count is identical across all four templates.

| Template | Layout |
|----------|--------|
| **Fullscreen** | Video fills the frame, subtitles at the bottom, no backdrop. |
| **Standard Podcast** | Video centred at readable size over a blurred backdrop, subtitles below it. |
| **Cinematic** | Taller video, heavier blur and dimming, oversized subtitles. |
| **Split Layout** | Bordered video in the upper half on a gradient, captions in the lower panel. |

Pick one in the clip editor's **Style** tab; it previews live and is shown again in the
export dialog before you render.

### Repositioning the backdrop

Templates with a video-derived backdrop (currently the blurred ones) let the user choose
which part of the source fills it, instead of being stuck with a centre crop:

- **Drag the background** anywhere outside the video rect. Dragging *inside* the rect
  moves the scene framing instead — the two never interfere.
- **Zoom** 1×–3×, plus **X / Y** sliders, and **Reset position**.
- The choice is saved on the clip (`bgZoom`, `bgX`, `bgY`) and used at export.

This is deliberately not per-template code. It runs through `backgroundWindow()` in
`templates.ts`, which is the same `computeCrop()` the scene framing uses, in the same
-100…100 / 1×–3× space. Any template whose background is video-derived gets drag, zoom
and reset for free — `backgroundIsAdjustable()` is the only gate, and it is one line.

At 1× the vertical axis is locked for the same reason it is on scenes: a 16:9 source
already shows its full height in a 9:16 frame. The editor says so rather than leaving a
dead slider.

### Adding a template

Add one entry to `TEMPLATES` in `src/core/domain/templates.ts`. Nothing else changes —
the preview, the ffmpeg graph and the picker thumbnail are all derived from the same
`TemplateLayout`:

```ts
{ background, video: {x,y,w,h}, fit, radius, border, subtitle: {align, marginY, scale} }
```

`templateGeometry()` converts that to even-numbered pixels for any export size, and both
renderers consume it, so a new preset cannot make the two disagree.

`templates.test.ts`-style invariants are worth keeping in mind for new presets: the video
rect must stay inside the frame, a template that leaves empty space must define a
backdrop, and captions must not land on top of the video. That last one caught a real bug
in the Split preset, whose captions were centred at 50% — directly over the picture.

### Scenes vs templates

They compose and neither knows about the other. A **scene** decides *which part of the
source* is shown (crop, zoom, split-screen). A **template** decides *where that result
sits* in the output frame. The scene renders into the template's video rect, then that is
composited onto the template's backdrop.

## Manual scene editor

Framing is **manual and per-segment**. There is no tracking and nothing is decided for
you: the AI picks *when* a clip starts and ends, you decide *what the camera looks at*
throughout it.

A clip is split into **scenes** by cut points you place on a timeline. Each scene owns
its framing completely — editing one never touches another.

**Timeline** (Scenes tab in the clip editor)

- Drag the ruler to scrub; the playhead marks the current position.
- **Add Cut** splits the scene under the playhead. The new scene inherits the framing it
  was split from, so a cut alone changes nothing visually until you reframe it.
- Click a segment to select it — the preview jumps there so you are always editing what
  you can see. During playback the selection follows the playhead.
- The bin removes the cut that starts the selected scene, merging it backwards.
- Scenes must be at least 0.5s; Add Cut disables itself rather than letting you make a
  segment too short to render.

**Per-scene framing**

- Presets: **Full Frame**, **Left Speaker**, **Right Speaker**, **Split Screen**.
- **Drag the video in the preview** to reposition. Movement tracks the cursor 1:1, with
  rule-of-thirds guides while dragging.
- **Zoom** 1×–3×, plus **X / Y** sliders on a -100…100 scale.
- Split Screen stacks two independent panes; each has its own zoom and position, and each
  can be dragged directly in the preview.

Worked example, exactly as the timeline stores it for a 20s clip:

| Scene | Range | Framing |
|-------|-------|---------|
| 1 | 0–5s | Left Speaker |
| 2 | 5–8s | Split Screen (A top, B bottom) |
| 3 | 8–15s | Right Speaker |
| 4 | 15–20s | Custom zoom 2.2× on speaker A |

### One geometry, two renderers

`sceneWindows()` in `src/core/domain/scenes.ts` returns, for a scene, the crop window in
the source and the destination rectangle in the output frame. The browser turns that into
CSS percentages; ffmpeg turns the *same* numbers into `crop=w:h:x:y` filters. They cannot
drift apart, so the preview is an accurate proxy for the export.

Split Screen is worth a note: a pane is twice as wide as the frame relative to its height,
so at 1× each pane would cover ~63% of a 16:9 source and the two panes would both show the
middle. The preset therefore ships a zoom (~1.27× for 9:16) at which each pane is exactly
half the source width and the two tile cleanly.

At 1× on a 9:16 output the vertical axis is intentionally locked: a 16:9 source already
shows its full height, so there is nothing to pan into. The editor says so rather than
leaving a dead slider. Zoom past 1× to unlock vertical movement.

### How multi-scene clips render

One scene renders in a single ffmpeg pass. Multiple scenes render each segment with its own
filter chain, concatenate them, then burn subtitles and the watermark over the result —
so caption timing stays relative to the clip and is unaffected by how it was cut.

Split-screen panes are produced with `filter_complex`: two crops of the same input,
scaled and `vstack`ed.

Live preview needs the video visible twice at once for split scenes, which one iframe
cannot do, so a second muted player is mounted and kept in sync (it re-seeks only on drift
over 0.3s). It is paused whenever no scene needs it.

## Caption integrity

Viral Caption mode changes **presentation only** — grouping, casing, emphasis, colour,
emoji. It may not change meaning.

This is enforced, not just intended: `assertMeaningPreserved()` in
`src/core/services/caption-builder.ts` walks every caption token against the spoken
transcript. Silence removal may *omit* filler words; a token that was never spoken fails
the check, and the pipeline aborts the clip rather than shipping it. The same check runs
again on every clip edit.

---

## Architecture

```
src/
  core/                    framework-free domain + application layer
    domain/                types, plans, clip rules, scoring, scenes, subtitle presets
    services/             pipeline, queue, caption builder, insight, export runner
    config.ts, errors.ts
  infra/                   replaceable adapters
    ai/                    llm-analyzer, local-analyzer, asr, synthetic-transcript
    youtube/               url, metadata, captions
    media/                 capabilities, ytdlp, renderer, ass-subtitles, storage
    auth/                  session, password, rate-limit
    db/ cache/ log/
  app/                     routes — (auth), (app), api, landing, pricing
  components/              ui primitives, app shell, editor, landing
  lib/                     api helpers, validation, serializers, client fetch
```

`core/` has no Next.js or Prisma imports in its domain layer. Every external dependency
(YouTube, ffmpeg, Whisper, the LLM, the queue) sits behind a module in `infra/` with a
narrow interface, so the in-process queue can become BullMQ and SQLite can become
Postgres without touching callers.

### Cross-cutting

- **Errors** — one `AppError` type, one `route()` wrapper, consistent `{ok, data|error}`
  envelopes; Zod issues become 422s with field paths.
- **Loading** — skeletons on every async surface, optimistic updates on rename/delete
  with rollback.
- **Retry** — GETs retry with backoff client-side; failed pipeline jobs retry once
  server-side and refund credits if they fail for good.
- **Caching** — TTL cache with single-flight de-duplication in front of YouTube.
- **Logging** — scoped structured logger; JSON lines in production.
- **Security** — scrypt password hashing, httpOnly session cookies, per-IP *and*
  per-account rate limits, Zod validation on every input, path-traversal guards on all
  file access, ownership checks on every record, security headers in `next.config.ts`.
- **Accessibility** — semantic landmarks, skip link, labelled controls, `aria-*` on
  switches/sliders/dialogs, visible focus rings, `prefers-reduced-motion` honoured.
- **SEO** — metadata + OpenGraph, JSON-LD, `robots.ts`, `sitemap.ts`.

---

## API

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/auth/register` `/login` `/logout` | Session auth |
| POST/PUT | `/api/auth/forgot-password` | Request / consume a reset token |
| GET/PATCH | `/api/auth/me` | Profile, password change |
| GET/POST | `/api/projects` | List / create (charges credits) |
| GET/DELETE | `/api/projects/:id` | Detail with clips, logs, transcript |
| GET | `/api/projects/:id/events` | SSE progress + log stream |
| POST | `/api/projects/:id/retry` | Re-run |
| GET | `/api/clips` | List, search, sort |
| GET/PATCH/DELETE | `/api/clips/:id` | Trim, restyle, and save the manual scene list |
| POST | `/api/clips/:id/duplicate` | Duplicate |
| GET/POST | `/api/exports` | List / start a render |
| GET/DELETE | `/api/exports/:id` | Status / remove |
| GET | `/api/exports/:id/download` | Stream the file |
| GET/POST | `/api/billing` | Usage, invoices, plan change |
| GET | `/api/dashboard` | Aggregated dashboard payload |
| GET | `/api/health` | Liveness + capability report |

---

## Known gaps

Stated plainly rather than hidden:

- **Billing has no payment processor.** `POST /api/billing` updates entitlements and
  writes an invoice row so the flow is fully exercisable. Put Stripe Checkout in front of
  that handler to charge for real; nothing else changes.
- **Password reset does not send email.** The token is logged server-side and returned in
  the response in development only. Wire a provider in
  `src/app/api/auth/forgot-password/route.ts`.
- **There is no face detection, by design.** A clip starts as one Full Frame scene: for a
  16:9 source in a 9:16 frame that keeps the *full* height and crops the sides, so nothing
  vertical is ever lost. Everything after that is manual (see Manual scene editor). To add
  an automatic *suggestion*, seed a scene's `zoom/x/y` from a detector — the whole
  pipeline already honours those values.
- **Multi-scene clips are encoded twice** (per-segment, then the concat + subtitle pass).
  That costs time and a generation of quality on long clips. Single-scene clips take the
  one-pass path and are unaffected. Rendering the whole thing in one `filter_complex` with
  timeline-gated overlays would avoid it.
- **Split-screen preview runs two YouTube players.** They are drift-corrected rather than
  frame-locked, so the two panes can sit up to ~0.3s apart while scrubbing. The export is
  frame-accurate regardless — both panes come from the same decoded input.
- **The blurred backdrop is static in the preview.** Showing a moving blur would need the
  video decoded twice at once, which one iframe cannot do and a second player cannot be
  re-parented into without being destroyed. The preview blurs the poster frame instead —
  right colours and composition, but it does not move. The export renders the real moving
  blur from the source.
- **No CSS transitions on layout inside the player.** `ClipPlayer` re-renders on every
  animation frame to drive the playhead, and a transition on width/height/left/top never
  settles under that: it sticks at its start value. This silently pinned the template's
  video rect to full-frame until it was measured. Template switches are instant.
- **The queue is in-process.** Fine for one server; use BullMQ or SQS for a fleet. A
  restart loses running jobs, so orphaned `running`/`queued` rows are failed on the next
  request with a "press Re-run" message — otherwise a dead row would block that video
  forever via the duplicate guard.
- **Rate limiting and caching are in-memory**, so they are per-instance. Move both to
  Redis behind their existing interfaces before scaling out.
- **Live preview needs an embeddable video.** When an owner disables embedding, the editor
  says so — captions and timings are still correct and still export.

## Scripts

```bash
npm run dev
```

```bash
npm run build
```

```bash
npm run typecheck
```

```bash
npm run setup
```
