# Meridian design system

Implemented in `frontend/src/styles.css` (tokens + components) and `frontend/src/components/*`.

## Identity
Name **Meridian**; mark = original “M-ridge with node” glyph in a sapphire→teal rounded square. Hero/brand gradient `#1d2f9e → #2747d6 → #0e9f9a`. No third-party brand assets.

## Tokens
| Group | Tokens (light) |
|---|---|
| Surfaces | `--bg #f4f5f8` (+ two soft radial tints), `--surface #fff`, `--surface-2 #f8f9fb`, `--surface-3 #eef0f5`, `--glass rgba(255,255,255,.72)` |
| Ink | `--text #12141c`, `--text-2 #4a5065`, `--text-3 #6b7287` |
| Brand | `--brand #2747d6`, `--brand-600 #1f3ab4`, `--accent #0e9f9a` |
| Status (fixed, always with icon + label) | good `#0ca30c`, warning `#fab219`, serious `#ec835a`, critical `#d03b3b`, unknown `#8a90a2` (hatched) |
| Categorical series (fixed order, never cycled) | `#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4 #008300 #6250d6 #e34948` (dark-theme steps defined separately) |
| Sequential | blue ramp `#cde2fb → #0d366b` (white ink on the darker half) |
| Radius | 6 / 10 / 14 / 20 px |
| Elevation | `--sh-1` hairline, `--sh-2` raised, `--sh-3` overlay |
| Focus | `0 0 0 3px rgba(39,71,214,.28)` visible on every interactive element |

Dark theme: opt-in toggle (persisted per browser), separately tuned surfaces, ink and series steps – not an automatic inversion.

## Typography
System UI stack (Inter if installed). Scale: 11 (tiny) · 12 (small/labels) · 13–14 (body/table) · 16 (card title) · 22 (page title) · 24–30 (hero). Weights 500/600/650/700. Numbers use tabular figures.

## Layout & grid
Shell: 248px collapsible sidebar (68px collapsed; drawer on mobile) + sticky glass top bar (56px). Content max 1600px, 24px gutters (16px mobile). 12-column grid (`g-12`, `span-*`) plus 2/3/4-column utility grids collapsing at 1200px and 760px.

## Components (catalogue)
Buttons (primary, default, ghost, danger, sm, block) · Inputs/selects/textarea with error state · Checkbox · Badges (tone variants, outline) · RAG badge (icon + label) · Status badge · KPI tile · Hero banner · Card (head/sub/actions) · Tabs · Segmented control · Progress bar · Progress ring · Data table (search, status filter, saved sort/filter, sortable headers, pagination, keyboard row activation) · Record form (metadata-driven, guarded statuses) · Record drawer (details/workflow/history) · Modal · Drawer · Toasts · Notification popover · Command palette · Kanban board (drag + buttons) · Timeline list · Skeleton · Empty state with SVG illustration · Error box · Note/warning callouts · Charts: bars (grouped/stacked/horizontal), trend line/area, donut, bubble/quadrant, waterfall, heatmap, Gantt, relationship graph, swimlane process map, funnel.

## Data-visualisation rules
Legend whenever ≥2 series; tooltip on every chart; “table view” toggle on every chart frame; no dual axes; categorical colour follows the entity; status colours never used as series colours; empty charts explain that missing data is not zero.

## Patterns
Loading = skeletons; empty = illustration + explanation + primary action; errors = inline box with retry; destructive = confirm; governed transitions = disabled options labelled “(via approval)”; synthetic data = persistent striped banner.
