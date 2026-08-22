# designSystem.md

# NexusGraph Design System

**Version:** 1.0  
**UI Framework:** React  
**Styling:** Tailwind CSS  
**Graph:** React Flow (`@xyflow/react`)  
**Design Direction:** Security operations workstation + modern data visualization

---

## 1. Design Principles

### 1.1 Intelligence First

The graph and evidence should dominate the interface. Decorative UI must never compete with investigation data.

### 1.2 Dense but Readable

This is an analyst tool, not a landing page. Prefer compact spacing, clear hierarchy, and high information density.

### 1.3 Evidence Over Assumptions

Observed facts, inferred relationships, and analyst notes must be visually distinguishable.

### 1.4 Calm Security Aesthetic

Avoid the stereotypical “hacker green terminal” look. Use dark neutral surfaces with restrained accent colors.

### 1.5 Progressive Disclosure

Show the important information first. Keep raw metadata, technical fields, and source details one click away.

---

## 2. Theme

Primary UI mode:

**Dark-first**

Optional future theme:

**Light analyst mode**

Recommended visual language:

```text
Background
near-black blue-gray

Surface
charcoal / slate

Border
subtle slate

Text
high-contrast neutral

Primary accent
indigo / violet

Security accent
cyan

Warning
amber

Danger
red

Success
emerald
```

Do not use neon green as the default. The cyber aesthetic has suffered enough.

---

## 3. Color Tokens

Example token structure:

```css
:root {
  --bg: #0b0f14;
  --surface: #111821;
  --surface-2: #17202b;
  --surface-3: #1d2733;
  --border: #283442;

  --text: #f3f6f9;
  --text-secondary: #aeb9c6;
  --text-muted: #74808d;

  --primary: #7c6cff;
  --primary-hover: #8b7dff;
  --cyan: #35c9e8;

  --success: #32c48d;
  --warning: #f2b84b;
  --danger: #ef6262;
}
```

Use semantic tokens rather than hardcoded colors throughout components.

---

## 4. Confidence Colors

Confidence is meaningful data and should be visually consistent.

```text
Very High  → success
High       → cyan
Medium     → warning
Low        → muted
Very Low   → danger-muted
```

Do not make confidence the only visual signal. Always display the numeric score or label.

---

## 5. Typography

Recommended:

### Primary
Inter

### Monospace
JetBrains Mono

Use monospace for:

- IP addresses
- hashes
- domains
- URLs
- API responses
- technical identifiers
- timestamps where precision matters

Typography hierarchy:

```text
Page title       24–30px
Section heading  16–18px
Body             14px
Metadata         12–13px
Graph label      11–13px
Code             12–13px
```

Use medium/semibold weights sparingly.

---

## 6. Spacing

Use a 4px base system.

```text
4   xs
8   sm
12  md
16  lg
20  xl
24  2xl
32  3xl
40  4xl
48  5xl
```

Analyst panels should normally use 12–20px internal padding.

---

## 7. Radius

```text
Card            10px
Input           8px
Button          8px
Badge           999px
Graph node      10–12px
Modal           12–16px
```

Avoid excessive pill UI. It makes every application look like a SaaS landing page from 2023.

---

## 8. Layout

Desktop primary workspace:

```text
┌──────────────────────────────────────────────────────────────┐
│ Header                                                        │
├───────────────┬──────────────────────────────┬───────────────┤
│ Left Sidebar  │          Graph               │ Detail Panel  │
│               │                              │               │
│ Case          │                              │ Entity        │
│ Entities      │                              │ Evidence      │
│ Filters       │                              │ Relations     │
│ Sources       │                              │ Timeline      │
│               │                              │               │
└───────────────┴──────────────────────────────┴───────────────┘
```

Recommended width:

```text
Sidebar:       240–280px
Detail panel:  320–400px
Graph:         remaining viewport
```

On mobile:

```text
Header
Graph
Bottom sheet / drawer
```

Do not attempt to keep a permanent three-column desktop layout on small screens.

---

## 9. Navigation

Primary navigation:

```text
Overview
Cases
Sources
Collectors
Reports
Settings
```

Inside a case:

```text
Graph
Timeline
Entities
Evidence
Notes
Activity
```

Icons should reinforce labels instead of replacing them.

Recommended icon library:

**Lucide React**

---

## 10. Buttons

### Primary

Used for:

- New Investigation
- Run Collector
- Save
- Export

Style:

```text
solid primary
high contrast
medium emphasis
```

### Secondary

Used for:

- Add Entity
- Add Note
- Filter

Style:

```text
surface background
subtle border
```

### Ghost

Used for:

- graph controls
- navigation
- secondary actions

### Danger

Use only for destructive actions:

- delete case
- remove evidence
- revoke access

Always show a confirmation for destructive case operations.

---

## 11. Inputs

Search input should be the dominant entry point on the dashboard.

Example:

```text
┌─────────────────────────────────────────────────────┐
│ Search username, email, domain, IP, or URL...      │
└─────────────────────────────────────────────────────┘
```

Seed input should also support selecting the type:

```text
[ Domain ▼ ] [ example.com                  ] [ Run ]
```

Validation should be inline and non-blocking.

---

## 12. Entity Node Design

Entity nodes are the heart of the graph.

Structure:

```text
┌──────────────────────────┐
│ ◉ DOMAIN                 │
│                          │
│ example.com              │
│                          │
│ 92% confidence           │
└──────────────────────────┘
```

Node elements:

- type icon
- entity type
- primary value
- confidence
- optional status indicator

Do not place long raw evidence inside nodes.

---

## 13. Entity Type Icons

Suggested Lucide mappings:

```text
PERSON          UserRound
USERNAME        AtSign
EMAIL           Mail
DOMAIN          Globe2
URL             Link2
IP_ADDRESS      Network
ORGANIZATION    Building2
REPOSITORY      GitBranch
SOCIAL_PROFILE  ContactRound
TECHNOLOGY      Cpu
CERTIFICATE     BadgeCheck
DOCUMENT        FileText
```

---

## 14. Relationship Design

Edges should remain visually quiet until selected.

Default:

```text
thin line
low opacity
small directional marker only when needed
```

Selected edge:

```text
higher contrast
relationship label visible
confidence badge visible
```

Example:

```text
DOMAIN ───── RESOLVES_TO ───── IP
```

Avoid giant arrows. The graph should feel like an information system, not a conspiracy board someone built at 3 AM.

---

## 15. Evidence Card

```text
┌──────────────────────────────────────────┐
│ Evidence                                 │
├──────────────────────────────────────────┤
│ Source                                    │
│ example-source.com                        │
│                                          │
│ Collected                                 │
│ 22 Aug 2026 03:10 UTC                    │
│                                          │
│ Confidence                                │
│ High · 91%                                │
│                                          │
│ [Open Source] [View Raw]                 │
└──────────────────────────────────────────┘
```

Evidence cards should always expose provenance clearly.

---

## 16. Detail Panel

The detail panel should use tabs:

```text
Overview | Relations | Evidence | Timeline | Raw
```

Top section:

```text
[icon]
DOMAIN
example.com

Confidence 92%
```

Middle:

```text
Quick facts
```

Bottom:

```text
Evidence
Relationships
Activity
```

Keep scrolling within the panel instead of expanding the whole page.

---

## 17. Graph Toolbar

Floating toolbar in the graph area:

```text
[ + ] [ - ] [ Fit ] [ Search ] [ Filter ] [ Layout ]
```

Secondary controls:

```text
[ Hide isolated ]
[ Highlight paths ]
[ Reset ]
```

Keyboard shortcuts:

```text
+ / -       Zoom
F           Fit graph
Esc         Clear selection
/           Focus search
Delete      Remove selected user-created node
```

---

## 18. Status System

Collector states:

```text
Queued      muted
Running     cyan
Completed   success
Partial     warning
Failed      danger
```

Example:

```text
DNS Collector       ✓ Completed
TLS Collector       ✓ Completed
GitHub Collector    ◐ Running
URL Collector       ! Partial
```

---

## 19. Empty States

Never show an empty graph without instruction.

Example:

```text
No entities yet

Start with a public domain, username,
email, URL, or IP address.

[ Add Seed ]
```

For a new case:

```text
Your investigation workspace is ready.

Add your first seed to begin collecting evidence.
```

---

## 20. Loading States

Prefer skeletons for static panels.

For collector jobs, show explicit progress:

```text
Collecting public DNS information...
━━━━━━━━━━━━━━━━━━━━━━░░░░ 72%

23 entities
8 relationships
11 evidence items
```

Do not fake progress percentages when the actual collector does not provide progress.

Use phase-based progress instead:

```text
[✓] Validate input
[✓] Query source
[●] Normalize results
[ ] Build relationships
[ ] Update graph
```

---

## 21. Toast Notifications

Use toasts for:

- collector completed
- export completed
- entity created
- evidence added
- save succeeded

Avoid toasts for critical warnings that require action. Use inline alerts instead.

---

## 22. Modals

Use modals only for:

- destructive confirmation
- collector configuration
- export configuration
- advanced filters

Do not use modals for ordinary entity inspection. Use the detail panel.

---

## 23. Accessibility

Minimum requirements:

- WCAG AA contrast target
- keyboard navigable controls
- visible focus state
- descriptive icon labels
- graph nodes accessible through a list/table fallback
- color must not be the sole indication of confidence or status

Graph data must have a non-visual alternative.

---

## 24. Responsive Behavior

### Desktop

Three-column investigation workspace.

### Tablet

Two columns:

```text
Graph + collapsible detail panel
```

### Mobile

Single column:

```text
Graph
↓
Bottom sheet
↓
Entity / Evidence
```

The mobile graph should allow pinch zoom and provide a list view for precise inspection.

---

## 25. Tailwind Token Strategy

Do not scatter arbitrary Tailwind values throughout the project.

Create semantic classes/tokens for:

```text
bg-app
bg-surface
bg-surface-hover
border-subtle
text-primary
text-secondary
text-muted
accent-primary
status-success
status-warning
status-danger
```

Component examples:

```text
<Card />
<Button />
<Badge />
<EntityNode />
<EntityDetailPanel />
<EvidenceCard />
<GraphToolbar />
<FilterBar />
<CollectorStatus />
```

---

## 26. Motion

Motion should communicate state changes, not decoration.

Recommended durations:

```text
Micro interaction     120–160ms
Panel transition       180–220ms
Modal                  200–240ms
Graph selection        120ms
```

Avoid constant animation on graph nodes. The analyst needs to see relationships, not watch them dance.

---

## 27. Visual Hierarchy

Priority order:

```text
1. Investigation graph
2. Selected entity
3. Evidence / provenance
4. Relationships
5. Timeline
6. Metadata
7. Secondary controls
```

---

## 28. Dashboard Design

Dashboard should contain:

```text
Investigations
─────────────────────────
Active cases
Recently updated
High priority

Activity
─────────────────────────
Collector jobs
New evidence
Relationship changes

Quick Start
─────────────────────────
[ New Investigation ]
[ Analyze Seed ]
```

Avoid generic SaaS metric cards such as:

```text
Users: 1,239
Revenue: $4,221
Growth: 31%
```

Those numbers are meaningless for an analyst workspace.

---

## 29. Report Design

Generated reports should be visually separate from the operational UI.

Report sections:

```text
Case Summary
Scope
Seed Indicators
Key Findings
Entity Graph
Important Relationships
Evidence
Timeline
Confidence / Limitations
Analyst Notes
Sources
```

Always include a limitations section so inferred relationships are not presented as facts.
