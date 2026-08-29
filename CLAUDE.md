# NexusGraph OSINT Investigation Platform - Engineering & Design Guidelines

## 🎨 UI & Frontend Design Guidelines (Anti-Slop Directives)

Always enforce these design principles across all components, pages, modals, and graph visualizations:

### 1. Visual Restraint & Color Palette
- **No Neon Glows or Saturated Halos**: Never use radioactive box-shadows, hyper-vibrant glow rings (`shadow-[0_0_24px_...]`, `ring-4 neon`), or multi-color rainbow gradients.
- **Sophisticated Dark Palette**: Stick to intentional dark slate/zinc neutral layers:
  - Base Backgrounds: `#080c14` (canvas), `#0c1017` (panels), `#101622` (headers/cards).
  - Subtle Borders: `#1e293b` (default), `#2d3748` (active/subtle hover).
- **Muted Semantic Accents**: Status colors (success, error, warning, info) must be soft and desaturated with low-opacity pill backgrounds (e.g. `bg-emerald-950/40 text-emerald-300 border-emerald-800/40`) rather than glaring high-contrast bright tones.

### 2. Typography & Microcopy
- **No AI-Cliché Emojis**: Never use decorative emojis or text glyphs (⚡, ✨, 🚀, 🎯, 🔮, ★, 💥) in UI elements, buttons, badges, or headers. Always use clean, semantic Lucide SVG icons.
- **Natural, Human Copywriting**: Avoid generic hype phrases, fake assistant marketing jargon, or unnecessary all-caps micro-labels (`TRACKING-WIDEST OVERKILL`).
- **Data-Dense & Readable**: Use clean monospace (`font-mono`) for hashes, IPs, domains, timestamps, and confidence scores; clean sans (`font-sans`) for titles and actionable text.

### 3. Components, Modals & Buttons
- **Geometric Precision**: Use crisp, standard border radiuses (`rounded-md`, `rounded-lg`). Avoid overly bubbly or pill-cluttered UI.
- **Button Restraint**: Buttons must feel grounded:
  - Primary: Refined, solid accent with high readability.
  - Secondary/Ghost: Subtle border + dark slate background with hover highlight.
  - Segmented controls: Tab pills enclosed in an outer border frame.
- **Information Density**: Keep spacing compact and deliberate. Avoid excessive blank gaps that isolate related elements.

### 4. Graph & Data Visualization
- **Structured Proximity**: Ensure cluster nodes, categories, and satellite members maintain balanced orbit radiuses without being pushed too far apart.
- **Clear Relationship Lines**: Graph edges must be crisp, legible lines with soft opacity and clean dashed patterns for logical/container links.
- **Micro-Interactions**: Hover and click transitions must be smooth, quick (150ms-200ms), and subtle without erratic bouncy scaling.

---

## 🛠️ Architecture & Code Standards

- **Monorepo Structure**:
  - `apps/web`: React + Vite + Tailwind CSS + XYFlow (React Flow)
  - `apps/api`: Fastify API backend
  - `packages/shared`: Shared types, graph layout math, collectors, and schema definitions
- **State Management**: Zustand (`useAppStore`) for active case context, selected nodes, live discovery logs, and filters.
- **Type Safety**: Strictly adhere to TypeScript interfaces in `@nexusgraph/shared`.
