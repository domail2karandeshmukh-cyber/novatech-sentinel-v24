# NOVATECH Sentinel V2.4 — design system

**Concept:** the enterprise nervous system. One signature visual — a precise cartographic atlas of western France
and Europe (Natural Earth coastlines, real coordinates for Angers, Nantes and Rennes) with dependency "nerves"
along which synthetic signals travel. The same atlas is used on the landing page, the Command Center and the
projector view; when a critical incident lands it focuses on the affected node. Everything around it is quiet.

**Colour = state, shape = type.** Colours never decorate:

| Token | Hex | Meaning |
|---|---|---|
| `--s-bg-1` canvas | `#080D17` | layered graphite-navy background |
| `--s-bg-3` raised | `#122136` | panels that hold decisions |
| `--s-text` | `#EFF5FF` | primary text (AA on all surfaces) |
| `--s-text-2` | `#9EB1C7` | secondary text — never tiny |
| `--s-teal` | `#35D6C1` | assured / connected / verified |
| `--s-amber` | `#FFCA70` | early warning, pending review, **simulated** (hatched) |
| `--s-crimson` | `#FF5F74` | genuine blockers and destructive actions only |
| `--s-cobalt` | `#6F95FF` | the active decision path and focus |

Node types on the atlas use shape (square office, diamond cloud, hexagon finance, circle clients), so status
colour is never ambiguous. "Simulated" uses an amber hatch pattern so it is recognisable without reading.

**Type:** Archivo variable (width + weight axes) for everything: expanded width for headlines, normal for text,
condensed for dense data; tabular figures for numbers. Geist Mono only for machine identifiers (incident refs,
hashes, coordinates). Sentence case labels; no decorative all-caps eyebrows. The critical overlay is the one
deliberate exception ("ATTENTION — CRITICAL SECURITY INCIDENT"), because the brief asks for it.

**Layout:** top command bar (no left sidebar), one primary action per screen ("Next authorized decision"),
a proof bar of the seven gates with the signer of each, and panels whose radius and elevation follow hierarchy.

**Motion:** one orchestrated moment per surface — the atlas drawing in on arrival, and the critical focus when an
incident starts. Everything else moves only in answer to a click. Reduced-motion and projector modes are first-class.
