# DESIGN.md — Module 1 Topic 1: Engineering Graphics Foundations (topic appendix)

> **This is a module-local appendix, not a copy of the platform design system.** The shared
> visual contract — colour tokens, typography, spacing, components, named rules — lives in the
> single root `../DESIGN.md` (ADR-022). On any conflict the **root file wins** (RULES.md §4.16).
> This file records only the things unique to this topic: how the four BIS line types map onto
> the viewport, and why the HP/VP/PP plane hues are deliberately **not** used here.

---

## 1. Subject

A single, orbitable 3D **Bearing Block** (a simplified one-piece pillow-block housing). The
student spins it in a live perspective scene; line classification is recomputed as the camera
moves. This is a **pictorial** view (one 3D object seen from a free angle), **not** an
orthographic multi-view projection — so the HP-teal / VP-amber / PP-violet plane encodings from
Module 2 and the root DESIGN.md §"viewport encodings" **do not apply**. There are no fold planes.

## 2. BIS line-type → token map (the only encoding this topic adds)

The four target line types of SP 46:2003 (BIS), as they render in the viewport. Type A and
Type E/F are produced **dynamically** by the live classifier (`lineDrawer.js`) and swap as the
student orbits; Type G and Type B are **authored annotations** that ride along with the model
(`annotations.js`).

| BIS type | Meaning | Token (root DESIGN.md) | Weight | Style | Source |
|---|---|---|---|---|---|
| **Type A** | continuous **wide** — visible edges | `--color-ink` (`#221f18`) | ~2.5 px | solid | dynamic — classified **visible** |
| **Type E/F** | **dashed narrow** — hidden edges | `--color-bench-grey` (`#938b7b`) | ~1.5 px | dashed (`dashSize 0.12 / gapSize 0.08`) | dynamic — classified **hidden** |
| **Type G** | chain thin — centre lines / axes | `--color-ink-secondary` (`#564e3c`) | ~1.3 px | chain (long-dash · short-dash, authored as segments) | authored annotation |
| **Type B** | continuous **narrow** — dimensions | `--color-ink` (`#221f18`) | ~1.0 px | solid (extension + dimension lines + arrowheads) | authored annotation |

Notes that bind this topic:

- **No hard-coded hex** anywhere (RULES.md §4.1). Every value above is read from a CSS token at
  runtime via the shared `cssColor()` helper; the hex in the table is documentation only.
- **Two-Cue Rule (root DESIGN.md):** every line type is separated by **weight + style**, not hue
  alone — Type A solid-wide vs Type E/F dashed-narrow vs Type G chain vs Type B solid-thin. Type A
  and Type B share the `--color-ink` hue intentionally; their cue is **weight** (2.5 px vs 1.0 px).
- **Chrome-Only Blue (root DESIGN.md §"named rules"):** `--color-accent` blue stays in the dock /
  step chrome; **no blue linework in the viewport.**
- **Flat-Ink:** the solid uses `MeshPhongMaterial { shininess: 0, flatShading: true }` with a flat
  ambient + single directional light and **no cast shadows** — engineering-textbook look, not
  presentation render (RULES.md §3.24, §4.9).

## 3. Fat-line stack (inherited, non-negotiable)

All four line types draw with the Simatrix fat-line stack — `LineSegments2` + `LineSegmentsGeometry`
+ `LineMaterial` (`three/addons/lines/`) — never `LineBasicMaterial` (RULES.md §3.12–§3.13). The
solid material carries `polygonOffset: true` so edge linework does not z-fight the faces
(RULES.md §3.18). `LineMaterial.resolution` is kept in sync with the canvas pixel size on every
resize (RULES.md §3.16); dashed materials get `computeLineDistances()` (RULES.md §3.17).

---

*Topic appendix only. Tokens, typography, spacing, and all named rules: see the root `../DESIGN.md`.*
