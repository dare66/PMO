# Accessibility checklist (WCAG 2.2 AA target) & visual QA

Status legend: ✅ implemented and checked in code/screenshots · ⏳ needs formal audit (axe + manual screen-reader pass, Phase 11).

| Criterion | Implementation | Status |
|---|---|---|
| 1.1.1 Non-text content | Decorative SVGs `aria-hidden`; charts have `role=img` + labels and a table view | ✅ / ⏳ SR pass |
| 1.3.1 Info & relationships | Semantic tables, labelled form fields, landmark `nav`/`main`, tablist roles | ✅ |
| 1.4.1 Use of colour | RAG badges carry icon + text; risk heatmap shows counts; legends | ✅ |
| 1.4.3 Contrast | Ink tokens ≥4.5:1 on surfaces; white ink on dark ramp cells | ✅ / ⏳ measure all states |
| 1.4.10 Reflow | Responsive grid; no horizontal page scroll at 390px (automated check) | ✅ |
| 2.1.1 Keyboard | Rows open with Enter; heatmap cells focusable; board move buttons; command palette arrows/Enter; Esc closes overlays | ✅ |
| 2.4.1 Bypass blocks | Skip link to `#main` | ✅ |
| 2.4.7 / 2.4.11 Focus visible, not obscured | Focus ring token; sticky bars are translucent and short | ✅ / ⏳ |
| 2.5.7 Dragging movements | Kanban has ← → buttons as single-pointer alternative | ✅ |
| 2.5.8 Target size (24px) | Buttons ≥28px; icon buttons 36px (26px on board) | ✅ |
| 2.3.3 / motion | `prefers-reduced-motion` disables animation | ✅ |
| 3.3.1/3.3.3 Error identification & suggestion | Field-level messages from server validation; business-rule explanations | ✅ |
| 4.1.2 Name, role, value | `aria-pressed`, `aria-selected`, `aria-current`, `aria-sort`, `aria-live` toasts | ✅ |

## Visual QA checklist (run `scripts/screenshots.mjs`)
- [x] Distinctive, consistent identity across all 25 captured screens
- [x] Command centre suitable for board presentation (hero, KPIs, 10+ visuals, drill-down)
- [x] All charts use live records; no hard-coded figures
- [x] Tables sortable/filterable/paginated
- [x] Loading (skeleton), empty (illustration) and error (retry) states
- [x] No broken images (only inline SVG and data-URI favicon)
- [x] No console/page errors during capture (401 probe before sign-in excluded)
- [x] Mobile 390px: no horizontal overflow; approvals usable
- [ ] Formal accessibility audit and usability test with real users (Phase 11)
