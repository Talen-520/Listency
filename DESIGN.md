# voiceAgent Design

## Direction

voiceAgent now uses a monochrome, local-first desktop design system:

- black and white as the core visual language
- light and dark themes with the same semantic tokens
- Inter as the primary UI font
- shadcn/ui-style open code components
- compact operational layouts over marketing-style surfaces
- clear controls for repeated local workflows

The app should feel calm, precise, and trustworthy. It is a control panel for a
local voice runtime, not a landing page.

## Theme

Theme values live in `app/desktop/src/styles.css` as CSS variables under
`:root` and `.dark`.

Use semantic Tailwind tokens instead of hard-coded colors:

- `bg-background`
- `text-foreground`
- `bg-card`
- `text-card-foreground`
- `bg-muted`
- `text-muted-foreground`
- `border-border`
- `bg-primary`
- `text-primary-foreground`
- `bg-destructive`

Avoid direct hex colors in React components unless there is a very specific
reason. Light/dark switching depends on shared semantic tokens.

## Typography

- Primary font: `Inter`
- Display font: `Inter`
- Font weights: 400, 500, 600, 700
- Letter spacing should remain normal.
- Use compact headings inside cards and panels.

The desktop app imports local Inter font files through `@fontsource/inter` so
it does not depend on a remote font CDN at runtime.

## Components

Prefer local shadcn-style components from `app/desktop/src/components/ui/`:

- `Button`
- `Badge`
- `Card`
- `Input`
- `Textarea`
- `Label`
- `Select`
- `Switch`
- `Tabs`
- `Table`
- `ScrollArea`
- `Separator`
- `Alert`
- `Sonner`
- `Tooltip`
- `HoverCard`
- `DropdownMenu`

Use Radix-backed controls for interactive primitives such as select menus,
switches, tabs, tooltips, dropdowns, and scroll areas.

## Layout

- Keep the desktop shell sidebar-first on medium and larger screens.
- Use a horizontal mobile nav when the sidebar collapses.
- Keep page content dense but breathable.
- Use cards for bounded tools, settings groups, logs, and repeated data.
- Do not nest cards inside decorative outer cards unless the inner card is a
  real sub-panel with separate behavior.
- Keep radii at 8px or below unless a component requires a smaller radius.

## Controls

- Buttons are for commands.
- Switches are for enabled/disabled tool state.
- Select menus are for provider and mode choices.
- Tabs are for related log/detail views.
- Tables are for session lists.
- Alerts are for action notices and errors.
- Sonner toasts are for transient action notices and runtime errors.
- Tooltips are for icon-only controls.
- Hover cards are for contextual help such as API key source links.

## Do

- Use the shadcn-style component layer before writing custom UI markup.
- Keep states visible in both light and dark themes.
- Preserve local-only trust signals such as `.env`, SQLite, and runtime status.
- Use black, white, and neutral grays as the default palette.

## Don't

- Do not reintroduce neon gradients or one-off accent palettes.
- Do not use hard-coded navy, cyan, violet, or pink colors in product UI.
- Do not scale font sizes with viewport width.
- Do not use oversized hero patterns inside the desktop control panel.
