---
name: Voice Agent Neon Audio
colors:
  background:
    page: "#070B14"
    section: "#0B1020"
    surface: "#10182B"
    surface-strong: "#16203A"
    surface-elevated: "#1B2745"
  text:
    primary: "#F5F7FB"
    secondary: "#B8C2D9"
    muted: "#7F8AA3"
    inverse: "#070B14"
  brand:
    primary: "#F36BFF"
    secondary: "#7C5CFF"
    accent: "#3EE7FF"
    success: "#3BF4A3"
    warning: "#FFC857"
    danger: "#FF6B8A"
  border:
    subtle: "#1F2A44"
    default: "#2A3658"
    strong: "#3A4C78"
  effects:
    glow-pink: "rgba(243, 107, 255, 0.35)"
    glow-cyan: "rgba(62, 231, 255, 0.25)"
    veil: "rgba(7, 11, 20, 0.72)"
typography:
  display-xl:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "72px"
    lineHeight: "0.96"
    fontWeight: 800
    letterSpacing: "-0.04em"
  display-lg:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "56px"
    lineHeight: "1.0"
    fontWeight: 800
    letterSpacing: "-0.035em"
  heading-lg:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    lineHeight: "1.1"
    fontWeight: 700
    letterSpacing: "-0.02em"
  heading-md:
    fontFamily: "Manrope, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    lineHeight: "1.15"
    fontWeight: 700
    letterSpacing: "-0.015em"
  body-lg:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    lineHeight: "1.6"
    fontWeight: 400
  body-md:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: "1.65"
    fontWeight: 400
  body-sm:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: "1.55"
    fontWeight: 500
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    lineHeight: "1.3"
    fontWeight: 600
    letterSpacing: "0.12em"
spacing:
  0: "0px"
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  10: "40px"
  12: "48px"
  16: "64px"
  20: "80px"
  24: "96px"
radius:
  sm: "12px"
  md: "18px"
  lg: "24px"
  xl: "32px"
  pill: "999px"
shadows:
  glow-sm: "0 0 0 1px rgba(255,255,255,0.04), 0 12px 30px rgba(5,10,20,0.35)"
  glow-md: "0 24px 80px rgba(5,10,20,0.42), 0 0 40px rgba(243,107,255,0.12)"
  glow-lg: "0 36px 120px rgba(5,10,20,0.55), 0 0 72px rgba(62,231,255,0.10)"
components:
  hero-shell:
    background: "radial-gradient(circle at top, rgba(243,107,255,0.18), transparent 34%), radial-gradient(circle at 80% 20%, rgba(62,231,255,0.12), transparent 26%), linear-gradient(180deg, #070B14 0%, #0A1020 100%)"
    borderRadius: "{radius.xl}"
    borderColor: "{border.subtle}"
  primary-button:
    background: "linear-gradient(135deg, #F36BFF 0%, #7C5CFF 52%, #3EE7FF 100%)"
    textColor: "{text.primary}"
    borderRadius: "{radius.pill}"
    shadow: "{shadows.glow-md}"
  secondary-button:
    background: "rgba(255,255,255,0.04)"
    textColor: "{text.primary}"
    borderColor: "{border.default}"
    borderRadius: "{radius.pill}"
  feature-card:
    background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 100%)"
    borderColor: "{border.subtle}"
    borderRadius: "{radius.lg}"
    shadow: "{shadows.glow-sm}"
  input:
    background: "rgba(11,16,32,0.88)"
    textColor: "{text.primary}"
    placeholderColor: "{text.muted}"
    borderColor: "{border.default}"
    borderRadius: "{radius.md}"
---

# Overview

Design for this project as a premium AI voice platform inspired by the public
ElevenLabs homepage: cinematic dark surfaces, vivid neon gradients, soft glass
panels, and an immediate sense of audio intelligence.

The UI should feel technical and enterprise-ready, but never cold. Favor bold
contrast, oversized headlines, spacious composition, and selective glow effects.

## Colors

- Use near-black navy backgrounds as the main canvas, not pure black.
- Reserve pink, violet, and cyan accents for CTA moments, highlights, active
  states, and audio-centric visuals.
- Keep large surfaces neutral and dark so accent lighting feels intentional.
- Use cool off-white for primary text and blue-gray for secondary text.

## Typography

- Headlines use `Manrope` or a visually similar geometric grotesk.
- Body copy uses `Inter` or a similar neutral sans.
- Hero headings should be short, assertive, and dominant in the first viewport.
- Labels and eyebrows should use tighter, more editorial styling.

## Layout

- Structure pages in clear vertical bands: hero, trust, features, workflow,
  developer or API content, and final CTA.
- Prefer asymmetrical hero layouts with strong copy on the left and a luminous
  product visual on the right.
- Preserve depth and drama on mobile instead of flattening every block into the
  same card pattern.

## Elevation And Depth

- Use layered surfaces, translucent fills, subtle borders, and soft long-range
  shadows.
- Use glow and blur selectively for hierarchy, not as a blanket effect.
- Let key CTA and hero elements feel slightly luminous even at rest.

## Components

- Hero modules should imply live audio, waveform activity, transcript flow, or
  voice-agent orchestration.
- Feature cards should be dark glass panels with tight copy and one strong
  visual signal.
- Inputs should feel premium and technical, with dark fills and accent focus
  rings.
- Code or API sections should feel integrated into the brand, not like default
  docs blocks.

## Do

- Use dark navy foundations with vivid but controlled neon accents.
- Keep sections spacious and visually paced.
- Make the first screen feel immediately product-specific.

## Don't

- Do not use flat white backgrounds for core product or marketing surfaces.
- Do not overfill the page with equally weighted cards.
- Do not fall back to generic SaaS gradients or default template styling.
