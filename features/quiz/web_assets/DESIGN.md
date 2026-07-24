# Design System: Zitthenkne Quiz (Ceramic Futurism & Kintsugi Porcelain)

## 1. Visual Theme & Atmosphere
A transcendent, ultra-premium medical examination interface crafted from high-fired 1300°C glazed ceramic porcelain (`Ceramic Futurism`), unified by luminous gold Kintsugi crack repairs where components meet or fracture. The atmosphere balances clinical serenity and tactile luxury — evoking a futuristic sanctuary for Y4 medical students preparing for high-stakes OSCE examinations. 

Rather than clinical sterility or generic flat cards, every interactive surface resembles polished ceramic tiles with soft double-drop shadows (`clay-ceramic elevation`) and micro-crackle textures (`Kintsugi veins`). When triggered or answered correctly, the golden seams pulse with a warm, serene glow (`#D4AF37`), turning rigor and mistake recovery into a meditative art form. Density is calibrated to **Daily App Balanced (5/10)**, Variance to **Offset Asymmetric (7/10)**, and Motion to **Cinematic Spring Physics (8/10)**.

---

## 2. Color Palette & Roles (3-Tier Design Tokens Architecture)

### Tier 1: Primitive Tokens (`:root`)
- `--color-porcelain-100`: `#FFFFFF` (Pure white glazed ceramic finish)
- `--color-porcelain-200`: `#FDFBF7` (Warm ivory ceramic base for light mode canvas)
- `--color-porcelain-300`: `#F3EFEA` (Recessed tile surface / disabled tile)
- `--color-obsidian-900`: `#141417` (Deep obsidian ceramic body for dark mode canvas)
- `--color-obsidian-800`: `#1E1E24` (Elevated dark ceramic card surface)
- `--color-obsidian-700`: `#282830` (Interactive dark tile container)
- `--color-kintsugi-gold-pure`: `#D4AF37` (Primary metallic kintsugi gold accent)
- `--color-kintsugi-gold-soft`: `#E6CA65` (Hover highlight / subtle gold vein)
- `--color-kintsugi-gold-dim`: `rgba(212, 175, 55, 0.18)` (Background glow / badge wash)
- `--color-ink-charcoal`: `#1F1F23` (Primary high-contrast text on porcelain)
- `--color-ink-slate`: `#64646F` (Secondary descriptive metadata & helper text)
- `--color-ink-silver`: `#A1A1AA` (Tertiary labels & borders)
- `--color-ink-light-primary`: `#F5F5F7` (Primary text on obsidian dark tiles)
- `--color-ink-light-secondary`: `#A0A0AB` (Secondary text on obsidian dark tiles)
- `--color-clinical-emerald`: `#10B981` (Correct answer / positive feedback status)
- `--color-clinical-rose`: `#F43F5E` (Incorrect answer / error recovery alert)

### Tier 2: Semantic Tokens
- `--surface-canvas`: `var(--color-porcelain-200)` (Theme dark: `var(--color-obsidian-900)`)
- `--surface-card`: `var(--color-porcelain-100)` (Theme dark: `var(--color-obsidian-800)`)
- `--surface-tile-elevated`: `rgba(255, 255, 255, 0.92)` (Theme dark: `rgba(30, 30, 36, 0.92)`)
- `--text-main`: `var(--color-ink-charcoal)` (Theme dark: `var(--color-ink-light-primary)`)
- `--text-muted`: `var(--color-ink-slate)` (Theme dark: `var(--color-ink-light-secondary)`)
- `--border-subtle`: `rgba(212, 175, 55, 0.25)` (Theme dark: `rgba(212, 175, 55, 0.35)`)
- `--border-kintsugi-active`: `var(--color-kintsugi-gold-pure)`
- `--accent-primary`: `var(--color-kintsugi-gold-pure)`
- `--accent-surface`: `var(--color-kintsugi-gold-dim)`
- `--status-success-surface`: `rgba(16, 185, 129, 0.12)`
- `--status-error-surface`: `rgba(244, 63, 94, 0.12)`

### Tier 3: Component Tokens
- `--btn-primary-bg`: `var(--color-ink-charcoal)` (Theme dark: `var(--color-porcelain-100)`)
- `--btn-primary-text`: `var(--color-porcelain-100)` (Theme dark: `var(--color-ink-charcoal)`)
- `--btn-primary-border`: `var(--color-kintsugi-gold-pure)`
- `--card-shadow-ceramic`: `0 20px 40px -15px rgba(20, 20, 23, 0.08), 0 0 0 1px var(--border-subtle)` (Theme dark: `0 20px 45px -15px rgba(0, 0, 0, 0.65), 0 0 0 1px var(--border-subtle)`)
- `--card-shadow-kintsugi-glow`: `0 0 25px -5px rgba(212, 175, 55, 0.45), inset 0 0 12px rgba(212, 175, 55, 0.2)`
- `--tile-radius-lg`: `1.75rem` (Generously rounded porcelain corners)
- `--tile-radius-md`: `1.25rem`
- `--tile-radius-sm`: `0.75rem`

---

## 3. Typography Rules & Scale (Fluid Typography & 4pt/8pt Spatial Grid)

### Font Stack Specification
- **Display / Headlines:** `Outfit`, `Cabinet Grotesk`, or `Be Vietnam Pro` (`700` & `800` weights). Track-tight (`letter-spacing: -0.02em`), structural confidence.
- **Body & Options:** `Be Vietnam Pro` or `Geist` (`500` & `600` weights). Relaxed measure (`max-width: 65ch`), high legibility with full Vietnamese diacritical support (`á, à, ả, ã, ạ, ê, ơ, ư, đ`).
- **Monospace / Statistics / Timers:** `Geist Mono` or `JetBrains Mono` (`600` & `700` weights). Strict tabular numbers (`font-variant-numeric: tabular-nums`) for timers, question counts, and percentage counters.
- **Banned Fonts:** `Inter`, `Arial`, `Helvetica`, `Times New Roman`, `Georgia`, `Montserrat`, `Roboto`. Absolute ban on generic system defaults and serif fonts within interactive quiz controls.

### Fluid Typography Scale (`clamp()` Enforcement)
All typography MUST scale dynamically via `clamp()` across viewport boundaries (`320px` to `1440px`). No static pixel sizes:
- `--font-display-xl`: `clamp(1.75rem, 3.5vw + 1rem, 2.75rem)` (Hero Quiz Title)
- `--font-heading-lg`: `clamp(1.25rem, 2vw + 0.75rem, 1.75rem)` (Section Headers & Question Stem)
- `--font-body-md`: `clamp(0.9375rem, 0.5vw + 0.85rem, 1.0625rem)` (Quiz Options A/B/C/D & Explanations)
- `--font-meta-sm`: `clamp(0.8125rem, 0.3vw + 0.75rem, 0.875rem)` (Helper tips, preset chips, badges)
- `--font-mono-stat`: `clamp(1.5rem, 2.5vw + 0.75rem, 2.25rem)` (Big Number counters in summary cards)

### Spatial Grid System (4pt/8pt Discipline)
All margins, padding, gaps, and structural heights MUST align strictly to multiples of `4px` (micro-spacing) or `8px` (layout spacing):
- Component gaps: `clamp(0.5rem, 1.5vw, 1.25rem)` (`8px` to `20px`)
- Section padding: `clamp(1.5rem, 4vw, 3.5rem)` (`24px` to `56px`)
- Touch target minimum: `44px × 44px` across all interactive buttons, preset cards, and option checkboxes.

---

## 4. Component Stylings & Interaction Mechanics

### A. Ceramic Porcelain Cards (`--surface-card`)
- **Visual Structure:** Glazed porcelain body with ultra-smooth `backdrop-filter: blur(20px)` properties when overlaid above subtle environmental canvas art.
- **Kintsugi Seam Border:** All container cards maintain a `1px` subtle gold kintsugi border (`var(--border-subtle)`). When active or focused, the border transitions to `var(--border-kintsugi-active)` (`#D4AF37`) with a golden inner/outer refraction glow (`--card-shadow-kintsugi-glow`).
- **Tactile Push Feedback:** Active/MouseDown state presses down (`transform: translateY(2px) scale(0.99)`) with compressed shadow depth (`box-shadow: 0 5px 12px rgba(0,0,0,0.15)`).

### B. Mode Preset Cards (1-Touch Quick Select)
- **Grid Layout:** 3-column responsive grid (`grid-cols-1 sm:grid-cols-3 gap-3`).
- **Ceramic Tile Behavior:** Each preset (`exam`, `study`, `sprint`) is housed in an elevated ceramic tile featuring an embedded 3D ceramic icon from the Asset Map (`./web_assets/badge_ceramic_*.png`).
- **Selection State:** Active preset receives a solid kintsugi gold border (`2px solid var(--color-kintsugi-gold-pure)`), a warm ivory/gold background wash (`var(--accent-surface)`), and a subtle golden upward lift (`transform: translateY(-4px)`).

### C. Quiz Option Choices (A, B, C, D Buttons)
- **Normal State:** Glazed ceramic tile with `var(--tile-radius-md)`, clean left-aligned option badge (`A`, `B`, `C`, `D`) in monospace.
- **Hover / Pointer State:** Magnetized subtle lift (`transform: translateY(-2px)`) + kintsugi gold outline (`border-color: var(--color-kintsugi-gold-soft)`).
- **Touch / Mobile State:** Swipe/Tap optimized with minimum `48px` height. Hover styles are suppressed on touch interfaces (`@media (hover: hover)` only for lift).
- **Correct State:** Instant ceramic glaze transformation to `--status-success-surface` with emerald kintsugi border (`#10B981`) and subtle pulse animation.
- **Incorrect State (Error Recovery & Affordance):** Transforms to `--status-error-surface` with rose kintsugi border (`#F43F5E`) and horizontal tactile shake (`wrong-answer-shake`). **Crucial Affordance:** Instantly reveals an inline "Giải thích chi tiết (Rationale)" accordion card below the answer AND an explicit **"Làm lại câu này (Retry / Undo)"** button if study mode is enabled, adhering strictly to Don Norman's usability principles for error recovery.

### D. Skeletal Shimmer Loaders (`.skeleton-line`)
- Must match exact target layout dimensions (`border-radius: var(--tile-radius-sm)`).
- Glazed ceramic gradient shimmer moving from `200%` to `-200%` across horizontal axis using soft gold-tinted porcelain tones (`rgba(212, 175, 55, 0.08)` to `rgba(212, 175, 55, 0.18)`). Absolute ban on generic circular spinners (`spinner-border` / rotating circles).

---

## 5. Layout Principles & Asymmetric Architecture
- **Hero Asymmetric Split:** On desktop viewports (`>= 1024px`), the Hero section adopts an asymmetric `40% / 60%` split layout. Left `40%` anchors the 3D Ceramic Kintsugi Mascot (`mascot_ceramic_kintsugi.png`) within a glowing floating tile; right `60%` houses the fluid display headline, dynamic tip ticker, and 3-tier statistical summary cards.
- **No Overlapping Clutter:** Every component occupies its own distinct spatial zone (`clear spatial separation`). Zero absolute-positioned text stacking over imagery.
- **Grid-First Math:** Layout divisions utilize CSS Grid (`grid-template-columns`) and flexbox gaps. Zero percentage `calc()` hacks.
- **Full-Height Section Discipline:** All primary viewports enforce `min-h-[100dvh]` (dynamic viewport height) to completely prevent iOS Safari bottom-bar jump artifacts.

---

## 6. Responsive Breakpoints & Mobile-First Strategy
- **Mobile (`< 640px`):** Strict 1-column stack. Hero mascot scales to compact `96px × 96px` floating header badge. Mode preset cards and statistical summary cards stack vertically or flow into a horizontal snap-scroll track (`overflow-x-auto snap-x scroll-pl-4`).
- **Tablet (`640px - 1023px`):** 2-column grid for custom options and statistical cards. Mode presets expand to 3-column bento tile layout.
- **Desktop (`>= 1024px`):** Full asymmetric gallery layout bounded by `max-w-6xl (1152px)` centered containment.
- **Horizontal Scroll Zero-Tolerance:** Any horizontal overflow on mobile (`scroll-x` outside designated snap carousels) is treated as a catastrophic layout failure (`overflow-x-hidden` enforced at root wrapper).

---

## 7. Choreography, Easing & Accessibility (a11y)

### Spring Physics & Custom Cubic-Beziers
- **Default Easing Contract:** All UI transitions MUST use hardware-accelerated spring curves: `cubic-bezier(0.19, 1, 0.22, 1)` (Expo Out) or `cubic-bezier(0.34, 1.56, 0.64, 1)` (Tactile Spring Bounce).
- **Absolute Ban on Linear Transitions:** `transition: all 0.3s ease` or `transition: all 0.2s linear` are STRICTLY BANNED. Only animate `transform` (`translate`, `scale`) and `opacity`. Never animate CSS `top`, `left`, `width`, `height`, or `box-shadow` directly (use pseudo-elements for shadow/glow transitions).
- **Staggered Orchestration:** List reveals (such as preview questions or option choices) must cascade with a `60ms` incremental delay per item (`animation-delay: calc(var(--item-index) * 60ms)`).

### Perpetual Micro-Interactions (Idle Loops)
- **Mascot Floating Loop:** The 3D Ceramic Mascot floats gently (`mascotFloat`: `4s ease-in-out infinite translateY(-8px) rotate(1deg)`).
- **Kintsugi Seam Breathing:** Active mode badges emit a perpetual subtle golden border pulse (`2.5s ease-in-out infinite opacity 0.7 to 1.0`).

### Accessibility & Reduced Motion Spec (`a11y`)
- **Keyboard Navigation & Focus Rings:** Every `<button>`, `<input>`, and `<label>` MUST expose a high-contrast focus ring (`outline: 2px solid var(--color-kintsugi-gold-pure); outline-offset: 3px`) when navigated via `Tab` key (`:focus-visible`).
- **Semantic ARIA Roles:** All interactive elements declare explicit `role`, `aria-label`, `aria-expanded`, and `aria-live="polite"` (for dynamic tip updates and quiz score announcements).
- **Mandatory Vestibular Protection (`prefers-reduced-motion: reduce`):**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  .mascot-floating, .skeleton-line, .animate-stripes {
    animation: none !important;
  }
}
```

---

## 8. Anti-Patterns & Blacklist (AI Tells to Eliminate)
- **NO Emojis as Icons:** Never insert raw emojis (`🎯`, `📖`, `⚡`, `🤡`) as primary UI section headers or preset cards. Use our bespoke 3D Ceramic Kintsugi PNG icons (`./web_assets/badge_ceramic_*.png`) or clean FontAwesome/SVG icons.
- **NO `Inter` or Generic Fonts:** Absolute ban on `Inter`, `Arial`, `Times New Roman`.
- **NO Pure Black (`#000000`):** Always use obsidian ceramic tones (`#141417` or `#1E1E24`) for dark surfaces and text.
- **NO Neon Purple/Blue Glows:** Banned AI cliché. All glows must be warm kintsugi gold (`#D4AF37`), pure ivory (`#FFFFFF`), or clinical status indicators (`emerald/rose`).
- **NO Inline CSS Styles:** All styles must reference `:root` tokens defined in this document or clean Tailwind token classes. Zero `style="..."` attributes inside HTML markup.
- **NO Filler AI Copywriting Clichs:** Ban "Elevate your learning", "Next-Gen Quiz", "Seamless experience", "Unleash potential". Use exact Vietnamese text documented in `./web_assets/content.md`.
- **NO Orphan / Floating Blocks:** Every card and control must sit within a disciplined grid container with proportional internal padding (`clamp(1rem, 2vw, 1.5rem)`).
- **NO `<div>` Soup:** Enforce strict semantic HTML5 tags (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<footer>`, `<button>`).
