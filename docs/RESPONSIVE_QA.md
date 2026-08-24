# Responsive QA and Regression Report

**Last verified:** 24 August 2026  
**Scope:** Friend Exchange / Gamekelder static frontend  
**Primary incident:** phone layout showed a nearly black background and, after horizontal movement, exposed the room image as a separate right-hand area.

## Root cause

The issue was reproducible at 320–412 px widths.

### 1. The holdings table widened the entire page

The table intentionally had a minimum width of approximately 590 px so its financial columns remained legible. However, its parent grid item retained the browser's default automatic minimum size. That caused the `holdings-card` itself to grow to approximately 624 px on a 360 px phone.

Before the fix, browser metrics at 360 px were:

```text
Viewport width:             360 px
Document scroll width:      631 px
Holdings card width:        624 px
```

The page therefore had a hidden horizontal canvas. Moving across it made the fixed background appear like a separate right-hand column.

### 2. Background stacking was fragile

The initial background element used a negative stacking level. Depending on browser painting and caching, it could end up behind the body's dark fallback colour. It also used only the wide desktop image, so portrait screens received a narrow and frequently dark crop.

### 3. Mobile glass was too opaque

Desktop smoked-glass values were carried directly onto phone screens. With less exposed background area on a portrait viewport, this made the page read as a mostly black dashboard rather than glass over a warm room.

## Implemented correction

### Layout containment

- Top-level `html` and `body` use horizontal clipping as a final safety boundary.
- All grid and flex children that can contain wide content now explicitly use `min-width: 0`.
- Holdings cards use `overflow: hidden`.
- The table remains wide, but its `.holdings-table-wrap` is the only horizontally scrollable element.
- The application switches to one content column at tablet/phone widths instead of shrinking the desktop grid.

### Background system

- The environment is fixed at `100vw × 100svh`/`100dvh` and no longer relies on negative stacking.
- A dedicated `480 × 854` portrait WebP focuses on the sofa, fireplace, stairs and gaming area.
- Mobile animation is disabled to avoid fixed-layer seams and compositing artefacts.
- The portrait overlay and vignette are intentionally lighter.

### Mobile glass and hierarchy

- Mobile glass uses lower fill opacity and a smaller blur radius.
- The top navigation becomes a contained 3 × 2 grid.
- The overview becomes a true single-column composition.
- The primary heading is constrained to one line without widening the document.
- Dialogs become bottom-sheet/full-viewport compositions.
- Sticky ticker content is clipped inside its own track.

## Automated regression suite

Run:

```bash
python -m pip install -r requirements-test.txt
python -m playwright install chromium
python tests/test_responsive.py --screenshots
```

The test inlines all CSS and both WebP backgrounds into an isolated browser document. This avoids network, caching and local-server differences.

### Verified viewports

| Case | Viewport | Result | Document overflow | Background coverage | Layout |
|---|---:|---|---|---|---|
| phone-320 | 320 × 700 | PASS | None | Full viewport | One column |
| phone-360 | 360 × 800 | PASS | None | Full viewport | One column |
| phone-390 | 390 × 844 | PASS | None | Full viewport | One column |
| phone-412 | 412 × 915 | PASS | None | Full viewport | One column |
| tablet-768 | 768 × 1024 | PASS | None | Full viewport | One column |
| laptop-1024 | 1024 × 768 | PASS | None | Full viewport | Responsive grid |
| desktop-1440 | 1440 × 900 | PASS | None | Full viewport | Multi-column |

**Result:** 7/7 passed.

The generated machine-readable metrics are written to:

```text
test-artifacts/responsive-results.json
```

## Invariants for future changes

A change is not ready to merge when any of these becomes false:

1. `document.documentElement.scrollWidth <= window.innerWidth + 1` at every supported viewport.
2. `.environment` covers at least the complete visual viewport.
3. The computed background contains a valid WebP image.
4. The overview grid has exactly one column on phones.
5. Wide financial tables scroll inside their card and never widen the document.
6. The phone title remains within its content box and stays on one line.
7. The top bar, mobile navigation, overview, hero and holdings card all remain inside the viewport.

## Manual release check

Automated containment tests do not replace visual judgement. Before merging a visual release, manually check:

- Android Chrome at approximately 360 × 800 and 412 × 915;
- desktop Chromium at approximately 1440 × 900;
- the overview, market, portfolio and minigame screens;
- opening and closing the trade and game dialogs;
- internal table scrolling without page movement;
- portrait-background focal point and text contrast.
