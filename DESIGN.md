# Design System

## Direction

Isumi Playground is a dark, personal utility workspace. It should feel like a compact toolbox for trusted tools: calm, capable, slightly playful, and private. The interface serves tasks first. It is not a landing page, a SaaS admin dashboard, or a decorative portfolio surface.

The visual reference is the shadcn/ui create preset `b2BVmR1GK`, adapted to Angular and Tailwind v4: dark zinc-like canvas, muted neutral surfaces, restrained emerald primary, crisp borders, Lucide icons, familiar controls, and compact surfaces that make tools easy to scan.

Physical scene: the owner is using the app late at night or between tasks, likely on a laptop, under low ambient light, wanting a private tool that feels calm and ready rather than bright, public, or corporate.

## Visual Principles

- Dark-first by default. Light mode is not the baseline visual identity.
- Primary emerald is deep, grounded, and functional. Use it for selected navigation, primary actions, focus accents, charts, and the product mark.
- Surfaces are layered by luminance, not by heavy shadows. Prefer borders, subtle contrast, and small elevation shifts.
- Components should feel shadcn-like in discipline: Tailwind semantic tokens, consistent radii, predictable states, and restrained styling.
- Bento grouping is allowed when it clarifies tool choices or related work. Avoid identical decorative card grids.
- Motion should be short and stateful: focus, save, loading, open/close. No page-load choreography.
- Hover states on buttons, links, cards, and panels should not animate position or scale by default. Prefer color, border, ring, underline, or subtle background changes. Avoid `hover:-translate-*`, `hover:scale-*`, and card lift effects unless a specific interaction truly benefits from physical movement.
- Typography is Inter, system fallback. Use weight and spacing before display-scale type.

## Color Strategy

Use the shadcn preset values as semantic Tailwind colors. Do not hand-author a parallel color palette in component classes. The implementation should translate the preset into Tailwind v4 with `@theme inline`, then use utilities like `bg-background`, `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`, `text-primary-foreground`, and `ring-ring`.

Tailwind v4 theme mapping:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}
```

Preset values:

```css
.dark {
  --background: oklch(0.141 0.005 285.823);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.21 0.006 285.885);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.21 0.006 285.885);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.432 0.095 166.913);
  --primary-foreground: oklch(0.979 0.021 166.113);
  --secondary: oklch(0.274 0.006 286.033);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.274 0.006 286.033);
  --muted-foreground: oklch(0.705 0.015 286.067);
  --accent: oklch(0.274 0.006 286.033);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.552 0.016 285.938);
  --chart-1: oklch(0.845 0.143 164.978);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.596 0.145 163.225);
  --chart-4: oklch(0.508 0.118 165.612);
  --chart-5: oklch(0.432 0.095 166.913);
  --sidebar: oklch(0.21 0.006 285.885);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.696 0.17 162.48);
  --sidebar-primary-foreground: oklch(0.262 0.051 172.552);
  --sidebar-accent: oklch(0.274 0.006 286.033);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.552 0.016 285.938);
}
```

Do not return to cream, sand, beige, or warm off-white app backgrounds. Warmth should come from copy, spacing, and small accent moments, not from a paper-like body color.

Do not replace the semantic utilities with raw Tailwind palette classes for product surfaces. Prefer `bg-background`, `bg-card`, `bg-secondary`, `bg-muted`, `text-muted-foreground`, `border-border`, `border-input`, `ring-ring`, and chart tokens. Use raw Tailwind palette utilities only for temporary one-off debugging or when a token truly does not exist.

## Component Vocabulary

Buttons:

- Primary: `bg-primary text-primary-foreground`, 40-44px height.
- Secondary: `bg-secondary text-secondary-foreground`, no border by default.
- Ghost: transparent until hover, then `hover:bg-accent hover:text-accent-foreground`.
- Destructive: use `bg-destructive` or `text-destructive`, never reuse orange or emerald as a generic warning color.
- Button hover should not move the control. Use background, foreground, border, and ring changes instead of translate or scale.
- Buttons should be borderless by default. Do not use bordered buttons for routine actions like refresh, logout, save, delete, navigation, or OAuth sign-in.
- If a button needs separation, prefer background contrast, subtle shadow, text/icon color, or focus ring. A border is reserved for rare contexts where the button sits on an indistinguishable surface and no other affordance is sufficient.

Navigation:

- Sidebar is the anchor surface, darker than content.
- Active items use `sidebar-primary`/`sidebar-accent` tokens plus strong foreground.
- Icons use `@lucide/angular`.
- Keep labels short and scannable.

Cards and panels:

- Use `bg-card`, `text-card-foreground`, and `border-border`; shadows should be minimal on dark surfaces.
- Radius should follow Tailwind/shadcn defaults (`rounded-md`, `rounded-lg` for larger panels). Avoid oversized rounded cards.
- No nested cards. Use section dividers, rows, or grouped fields instead.
- Card hover should not lift, jump, or scale by default. Use border, background, or foreground emphasis for clickable cards.

Forms:

- Inputs use `bg-background` or `bg-secondary` with visible `border-input`.
- Placeholder text must meet contrast and be visibly lower emphasis than entered text.
- Focus uses `ring-ring`, with Tailwind focus utilities.

States:

- Loading uses skeletons, not centered spinners inside empty content.
- Empty states should teach the next action in one sentence.
- Errors use destructive tokens and clear text. No left-stripe alerts.

## Layout

- Authenticated pages use shell + sidebar + topbar.
- Content width stays constrained, but tool screens may use dense two-column layouts when useful.
- Mobile collapses structurally: sidebar becomes top navigation, actions stack, note/card grids become single column.
- Product headings are fixed rem sizes. Avoid fluid `clamp()` display headings in task UI.

## Typography

- Font: Inter from Google Fonts.
- UI labels and buttons: 0.875rem to 0.95rem, 600-800 weight.
- Page h1: 2rem to 2.75rem, compact line height, balanced wrapping.
- Body copy: 0.95rem to 1rem, 1.5 line height.
- No all-caps section scaffolding. Short labels can be sentence case or compact title case.

## Iconography

- Use `@lucide/angular` as the default icon set.
- Import only the standalone Lucide icons used by each Angular component.
- Icons are functional affordances, not decoration. Use them for navigation, actions, status, and compact tool identification.

## Copy

- Portuguese UI copy should be direct and friendly.
- Button labels must describe the action: `Salvar nota`, `Atualizar lista`, `Remover`.
- Avoid generic productivity buzzwords. Name the thing the user can do.

## Accessibility

- Maintain WCAG AA contrast on dark surfaces.
- Keyboard focus must be visible on every interactive element.
- Do not rely on color alone for active, error, or loading states.
- Respect `prefers-reduced-motion`.

## Implementation Checklist

- Start new UI work from semantic Tailwind utilities, not hard-coded palette classes.
- Keep `@theme inline` as the bridge between shadcn preset CSS variables and Tailwind utilities.
- Search for hover movement utilities (`hover:-translate`, `hover:translate`, `hover:scale`) before shipping and remove them from buttons and cards unless deliberately justified.
- Search for bordered button classes (`border`, `border-*`) on button-like controls before shipping. Remove them unless the design explicitly needs that exception.
- Prefer existing shell, button, form, empty, error, and skeleton patterns.
- Before shipping a page, check desktop and mobile layouts.
- Search for banned patterns: `border-left` alert stripes, gradient text, decorative glassmorphism, cream body backgrounds, repeated eyebrow scaffolding, and huge product headings.
