# Celebrate — "Nocturne" design language

Inspired by [activetheory.net](https://activetheory.net/): a near-black immersive
canvas, bold grotesk display type with monospace micro-labels, vivid gradient
accents that **glow**, generous negative space, and **motion treated as a
material** — not decoration. Adapted for Celebrate as a "celebration at night"
language: fireworks-bright accents over a deep, calm dark.

This replaces the previous "warm paper / calm editorial" system. The token names
are unchanged so the component layer cascades; only the values inverted.

---

## Principles

1. **Dark is the canvas, light is the subject.** Near-black background; content
   floats on glass. The page recedes so the plan glows.
2. **Motion is a material.** A drifting aurora behind everything, entrance fades,
   hover lifts, glowing focus rings, a panning gradient on the primary action.
   Never gratuitous — it signals liveness and depth. All of it collapses under
   `prefers-reduced-motion`.
3. **One luminous accent, used like light.** A magenta→violet→cyan gradient is the
   single hero accent. It fills the primary action, the active segment, the lock
   glow — and it actually emits light (box-shadow glow), it isn't just a fill.
4. **Type does the shouting.** Big, tight grotesk display headings; small, wide
   monospace micro-labels (the "index tag" / kicker). Body stays quiet.
5. **Restraint at scale.** The dark + glow vocabulary is loud by default, so
   everything else is calm: thin hairline borders, lots of space, one accent.

---

## Palette (tokens in `src/index.css`)

| Token | Value | Role |
|---|---|---|
| `--bg` | `#07070c` | page canvas (deep night) |
| `--card` | `rgba(17,17,26,0.64)` | glass panels & cards (blurred over the aurora) |
| `--paper` / `--paper-2` | `rgba(255,255,255,0.045)` / `0.085` | input/seg surfaces, hover/alt rows |
| `--ink` / `--ink-soft` / `--muted` | `#f2f1f8` / `#b6b6c8` / `#76768c` | text ramp |
| `--line` / `--line-strong` | `rgba(255,255,255,0.10)` / `0.20` | hairline borders |
| `--accent` / `--accent-ink` | `#7b6bff` / `#aea2ff` | accent fill / accent text on dark |
| `--grad` | `linear-gradient(115deg,#ff5d8f,#7b6bff,#36e0ff)` | the hero gradient |
| `--accent-glow` | `rgba(123,107,255,0.5)` | the light an accent emits |
| `--terracotta` | `#ff7a59` | festive coral highlight (sparing) |
| `--ok` / `--warn` / `--danger` | `#2ee6a6` / `#ffb84d` / `#ff5d7a` | status, each with a `*-tint` |

Status colors are **luminous on dark** (mint, amber, rose), each paired with a
~15%-opacity tint for fills and a ~35–40% border.

## Type

- **Display** (`--display` / legacy `--serif`, repointed): **Space Grotesk** 700,
  tight tracking (`-0.025…-0.04em`), pure white. All `h1–h3` and headline accents.
- **Body** (`--sans`): Space Grotesk 400.
- **Micro-label** (`--mono`): **Space Mono**, uppercase, `0.18–0.2em` tracking,
  muted — the kicker, the card module tag, section labels. This is the
  Active-Theory "index tag" signature.
- `.grad-text` clips `--grad` into text for accent words; `.tag` is the mono label.

## Motion

- **Aurora** — `body::before`, three soft radial gradients (magenta/cyan/violet)
  drifting on a 26s alternating loop. **Grain** — `body::after`, an SVG fractal-
  noise overlay at ~4.5% opacity for texture.
- **Entrance** — `.panel`/`.card` fade-up (`opacity` + 14px rise, 0.5s ease-out).
- **Hover** — cards lift 2px and gain an accent ring; buttons brighten/pan.
- **Focus** — inputs get an accent ring **plus** a glow (`box-shadow` blur).
- **Primary action** — gradient with a glow shadow; gradient pans on hover.
- All keyframes are disabled under `@media (prefers-reduced-motion: reduce)`.

## Surfaces

Glass: translucent dark fill + hairline border + `backdrop-filter: blur(14px)` +
soft black shadow. Hover adds a 1px accent ring. Radius `14px` / `9px`.

## Components (in `src/index.css` + feature CSS)

- **Buttons** — `.primary` = gradient + glow; default = translucent glass that
  brightens; `.ghost` = accent text.
- **Segmented control / tabs** — active segment is the gradient with glow.
- **Switch** — on-state track is the gradient and glows.
- **Cards** (`card.css`) — glass; locked card shows an accent left-bar + glow;
  badges/feasibility/nudge use the luminous status tints.
- **Banners** (`planview.css`) — stale = amber tint; archive/callout = accent tint.

## Do / Don't

- **Do** let the background breathe — keep big dark space around content.
- **Do** use the gradient sparingly: one primary action, the active state, the lock.
- **Don't** put the gradient on large fills or multiple things per screen — it
  stops reading as "light" and becomes noise.
- **Don't** use pure black (`#000`) or pure flat panels — the cool-tinted `#07070c`
  + glass + grain is what gives depth.
- **Don't** add motion that doesn't signal state or depth.
