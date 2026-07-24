# Design System: Zitthenkne - Archive Fever (Link Vault)

## 1. Visual Theme & Atmosphere
A highly tactile, analog, and slightly paranoid interface. The atmosphere is that of a leaked classified dossier—heavy manila folders, redacted typewriter text, stark red rubber stamps, and physical paperclips. It feels secretive, robust, and completely devoid of modern digital fluff.

## 2. Color Palette & Roles
- **Manila Base** (#E6D5B8) — Primary background surface for the card (folder material)
- **Aged Paper** (#F4EBD9) — Secondary surface for attached photos/documents
- **Typewriter Ink** (#1C1C1C) — Primary text, harsh and imperfect
- **Redacted Black** (#0A0A0A) — Used for redaction bars and deep shadows
- **Classified Red** (#D32F2F) — Accent color for stamps, urgent markers, and focus states
- **Paperclip Silver** (#9CA3AF) — Metallic accents

## 3. Typography Rules
- **Display/Stamps:** `Impact`, `Arial Black`, or rigid Sans-Serif — Used strictly for uppercase, stamped text (e.g., "MẬT").
- **Body:** `Courier New`, `Consolas`, `JetBrains Mono` — Typewriter aesthetic for all body text.
- **Banned:** `Inter`, friendly rounded fonts, cursive.

## 4. Component Stylings (Link Vault Card)
* **The Card (Folder):** Sharp or slightly uneven corners. A paper texture overlay (via CSS noise or subtle gradient). Asymmetric padding.
* **The Image (Attached Photo):** The squirrel image must be styled as a physical polaroid or document attached to the folder. Grayscale filter + high contrast + a CSS paperclip or tape.
* **Text & Redaction:** Some text can have a black background to look redacted on hover. 
* **The Stamp:** A CSS-drawn red stamp ("TÀI LIỆU MẬT" or "TOP SECRET") rotated at a random angle (-15deg).
* **Hover State:** Instead of a smooth float, the card shifts abruptly (translate) with a harsh, un-blurred shadow (offset 8px 8px). 

## 5. Layout Principles
- Absolute positioning for decorative elements (stamps, paperclips) inside the relative card.
- Overlapping is ALLOWED here, but only to simulate physical objects (a stamp over text, a clip over a photo).

## 6. Motion & Interaction
- **Hover/Active:** No soft easing. Use `cubic-bezier(0, 1, 0, 1)` or linear 0.1s for a snappy, mechanical feel.
- **Redaction Reveal:** Hovering over redacted text smoothly reveals it.

## 7. Anti-Patterns (Banned)
- No soft pastel gradients (except existing Zitthenkne UI, but NOT in this card).
- No perfectly round border-radius on this card (max 4px).
- No soft, blurred drop-shadows (use solid offset shadows).
- No emojis inside the folder content.
