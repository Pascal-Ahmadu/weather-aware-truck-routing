# Design Guide — Weather-Aware Truck Routing

Single-page operational tool. One job: enter a trip, see which route is safest and why.
Tone: calm, precise, safety-first. Light, paper-white canvas with a dot-matrix texture
(after the Figma "dotted map" reference) so the real map and the risk colours carry the attention.

## Brand & voice

- Product name: **Weather-Aware Truck Routing**
- Tagline: *Compare routes by forecast risk at the hour your truck actually arrives at each checkpoint.*
- Voice: short, declarative, operational. "Find safest route", not "Let's plan your journey!". Numbers over adjectives.
- No illustrations or stock imagery. The map is the hero.

## Colour

### Surfaces & text (light theme)
| Token | Hex | Use |
|---|---|---|
| Background / Panel | `#FFFFFF` | page, sidebar, cards, overlays (overlays at 95 %) |
| Dot texture | `#E3E3E3` | 1 px dots on a 16 px grid behind the sidebar and empty state |
| Input surface | `#F7F7F6` | inputs, risk-bar track |
| Border | `#DADADA` | all borders, dividers |
| Text | `#0B0900` | primary text |
| Muted | `#6F6D68` | captions, secondary data |
| Accent | `#18A7B9` | primary button, focus ring, slider, toggle |
| Accent strong | `#11899A` | button hover, selected route line, badge text |
| Accent soft | `rgba(24,167,185,0.12)` | "Recommended" badge background |
| Danger | `#C62828` | validation and error text, No Travel warning |
| Unselected route | `#8A8884` at 55 % | non-selected polylines |
| Basemap | Esri World Light Gray (keyless) | keeps the map quiet under the risk colours |

### Risk palette (fixed — the only semantic colours in the product)
| Level | Hex | Meaning |
|---|---|---|
| Low | `#2E9E5B` | normal driving |
| Moderate | `#E0B300` | caution |
| High | `#F0821E` | reduce speed / consider alternatives |
| Severe | `#D7263D` | avoid |
| No Travel | `#6A0DAD` | hard stop |
| Unknown | `#9AA0A6` | no forecast data (never shown as Low) |

Rules: risk colours are used only for risk (markers, heatmap, stacked risk bar, legend). Never use green/red for generic success/error UI — use the Success tint and Danger tokens instead so risk colour stays unambiguous.

## Typography

- Font: **Inter** (fallback system-ui). Tabular numerals everywhere numbers align (ETAs, miles, slider value).
- Icons: **Heroicons** only — 24px outline for leading icons in controls and the title (`Truck`), 20px solid for inline/status glyphs (`CheckBadge`, `ExclamationTriangle`, `InformationCircle`, chevrons, `Check`). Icons are always decorative (`aria-hidden`) next to visible text.
- Scale:
  - H1 20px / 600 — product name in sidebar
  - H2 16px / 600 — "3 routes" results heading
  - Body 14–15px / 400
  - Label 13px / 400, muted colour — form labels, stat captions
  - Small 12px — notes, legend, slider scale
  - Stat value 14px / 600
- Line-height 1.4 for body, 1.2 for headings. Sentence case throughout; the only uppercase is the "RECOMMENDED" badge (11px, letter-spacing 0.03em).

## Spacing, shape, elevation

- Base unit 4px; common gaps 8 / 12 / 20.
- Sidebar padding 20px. Card padding 12px. Input padding 9px 10px.
- Radius: 2px everywhere (near-square, per the reference), 999px badges, 4px risk bar.
- Borders 1px `#DADADA`; selection = border + 1px inset ring in Accent. No drop shadows; overlays use 95% white + 6px backdrop blur.
- Focus: 2px Accent outline, 1px offset (keyboard-visible on every control).

## Layout

Desktop (≥ 860px): two columns — **sidebar 420px** (scrolls) + **map fills the rest**, full viewport height, no page scroll.

```
┌────────────┬──────────────────────────────────────┐
│ Title      │                              [Legend] │
│ Tagline    │                                       │
│ ────────   │                                       │
│ Trip form  │            MAP (full bleed)           │
│ [Find      │   3 route lines, checkpoint dots,     │
│  safest]   │   heatmap overlay                     │
│ ────────   │                                       │
│ Route card │                                       │
│ Route card │      [ Heatmap toggle   +12h · Sat ]  │
│ Route card │      [======●=================== ]    │
└────────────┴──────────────────────────────────────┘
```

Mobile (< 860px): sidebar stacks on top (max 55vh, scrolls), map below at 70vh, legend hidden, slider stays docked at the bottom of the map.

## Components

**Controls (no native widgets)** — every form control shares one 42px chrome: `#F7F7F6` fill, 1px `#DADADA` border, 2px radius, 18px Heroicons outline icon on the left in Muted, accent border + soft accent ring on focus/open. Text inputs (Origin, Destination with `MapPin`; Load weight with `Scale`, numeric keyboard, no spinners). Selects are Headless UI Listboxes: same chrome with a `ChevronUpDown` trailing icon; the options panel is a white 8px-radius card with the map-card shadow, `#F3F4F6` hover, and a teal `Check` on the selected row. Toggles are Headless UI Switches (36×20, `#D1D5DB` off / Accent on). The forecast slider is a range input with a 6px track (Accent fill to the thumb, `#E5E7EB` after) and an 18px white thumb with a 2px Accent border.

**Date & time picker** — the Departure control opens a Headless UI Popover: white panel, 1px `#E5E7EB`, **12px radius**, shadow `0 25px 25px rgba(0,0,0,.15)`, 16–20px padding. Month title 18px/500 `#344A4D` centred between `ChevronLeft`/`ChevronRight` nav buttons (`#1F2937`). Weekday labels 14px/500 `#6B7280`. Day cells 44px round buttons, 14px/500 `#344A4D`; hover `#F3F4F6`; **selected = filled `#344A4D` circle with white text**; today = 1px Accent ring; disabled/outside days `#D1D5DB`. A hairline divider, then "Depart at" with compact hour and minute Listboxes (15-minute steps). Week starts Monday; dates limited to today → +14 days (forecast horizon).

**Trip form** — fields: Origin, Destination (text, placeholder "City, address or lat,lon"), Departure (date & time picker), Load weight (lb), Checkpoint every (Listbox 10 / 25 / 50 miles). Inline errors under the field in Danger. One primary button, full width: "Find safest route" with a trailing `ArrowRight` → disabled with "Checking weather along routes…" while pending.

**Route card** (one per route, click to select) — header row: `#rank`, "525 mi · 8h 18m", "Recommended" badge on rank 1. Below: **stacked risk bar** (8px tall, segments proportional to miles per level). Then a 4-column stat row: Arrives · Severe mi · High mi · Avg risk. Optional warning line in soft red if any No Travel miles, grey note if any Unknown miles. Selected state = Accent border.

**Map** — Esri World Light Gray base + reference labels (keyless). Routes as polylines: selected Accent-strong 6px @ 95%, others `#8A8884` 4px @ 55%. Checkpoints as circle markers filled with their risk colour, white 2px stroke, 7px radius selected / 4px others. Origin and destination are dark-slate `#344A4D` pins with a white centre and soft drop shadow.

**Map cards (tooltip on hover, popup on click)** — white card, 1px `#E5E7EB` border, 8px radius, layered shadow (`0 20px 13px rgba(0,0,0,.03)`, `0 8px 5px rgba(0,0,0,.08)`), bottom beak. Title 14px/500 in `#344A4D` ("Mile 50 · 2:00 PM"), muted 12px subtitle, then a **risk badge**: a square-cornered chip with a 6px dot, risk colour at 22% as background and the same colour darkened for text (e.g. Low reads as the reference's teal `#B3E7DD`/`#115E59`; Severe as its red tint). Popups add a 3-column Wind / Rain / Snow reading grid.

**Heatmap** — density layer over all checkpoints, gradient = risk palette in order Low → No Travel, ~35% minimum opacity, 28px radius. Toggle on/off.

**Forecast slider** — docked bottom-centre overlay, 640px max. Header: heatmap checkbox left, "+12h · Sat, Nov 1, 2:00 AM" right. Native range input 0–48 with Accent thumb; scale labels Departure / +24h / +48h. Must feel instant: no fetch on drag.

**Legend** — top-right overlay, six rows of 12px swatch + label.

**States** — empty: centred muted text "Enter a trip to see routes, checkpoints and the weather heatmap." Loading: spinner + one line in the sidebar; map stays interactive. Error: message under the form; never a blank map.

## Don'ts

- No login, nav bar, tabs, dashboards, marketing sections or extra pages.
- No gradients on UI chrome (the heatmap is the only gradient).
- No red/green for anything but risk.
- No modals — everything is visible on one screen.
