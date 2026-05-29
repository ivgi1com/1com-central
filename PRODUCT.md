# Product

## Register

product

## Users
NOC operators and sysadmins at 1COM monitoring a cluster of up to 50 Asterisk PBX nodes. They work at a desk, often on a large monitor, checking the dashboard throughout the day or during incidents. Context: live production operations.

## Product Purpose
Real-time SSH monitoring dashboard for Asterisk nodes. Polls every 30s, surfaces call volume, peer counts, system health, and enables per-tenant action execution. Success = operator sees a problem instantly and acts on it without leaving the dashboard.

## Brand Personality
Precise, calm, authoritative. The interface should feel like professional operations tooling — not enterprise bloatware, not toy SaaS.

## Anti-references
- Generic Bootstrap admin panel look (Sneat/AdminLTE defaults)
- Playful SaaS dashboards (pastel, rounded-everything, illustration-heavy)
- Aggressive "cyberpunk" neon (too loud for daily NOC use)

## Design Principles
1. Data first: the metric is always the strongest element on screen
2. Status at a glance: operators should know cluster health in under 2 seconds
3. Calm urgency: warnings must be visible without causing visual noise
4. Earned density: pack information tightly, but not tighter than readability allows
5. Motion conveys state: animations communicate live data and transitions — not decoration

## Accessibility & Inclusion
WCAG AA minimum. Reduced-motion alternative for all animations. High-contrast status colors with non-color secondary indicator (icon/label).
