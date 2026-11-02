# Flashcards WebApp — Material You V3 Design Language

> **Version**: 3.0 Expressive  
> **Specification**: Google Material Design 3 (Material You Expressive) & `@material/web`  
> **Last Updated**: October 2026  

---

## 1. Design Vision & Foundations

The Flashcards web application utilizes the **Google Material Design 3 (Material You) Expressive** design system. The core tenets are:

1. **Dynamic & Accessible Tonal Contrast**: Colors are organized into tonal palettes (0–100 luminosity scale), guaranteeing accessible contrast ratios (WCAG 2.1 AA/AAA) across the Light theme. **Note: The application is strictly Light Theme Only; Dark Mode is explicitly prohibited.**
2. **Expressive Fluid Geometry**: Generous corner radiuses up to **28px** (extra-large) and **9999px** (pill/full), creating a friendly, high-focus study environment.
3. **Parametric Variable Typography**: Distinctive page titles powered by **Roboto Flex** with custom variable axes, paired with clean interface typography.
4. **Authentic Motion & State Layers**: Natural touch/click-originating Material 3 ripples, spring-physics transitions, and Google 4-color indeterminate progress indicators.

---

## 2. Color System & Material Guidelines

Material Design 3 defines colors not as static isolated swatches, but as **tonal relationships**. Each key hue generates a tonal palette consisting of 13 tones ranging from 0 (pure black) to 100 (pure white).

### 2.1 Reference Tonal Palettes

```
Tone:  0     10    20    30    40    50    60    70    80    90    95    99    100
       ■     ■     ■     ■     ■     ■     ■     ■     ■     ■     ■     ■     □
     Black <-------------------------- Luminosity --------------------------> White
```

* **Primary Palette**: Key brand hue (Cobalt / Vibrant Royal Blue, `#1a56db` base).
* **Secondary Palette**: Supporting action hue (Indigo / Deep Violet, `#4f46e5` base).
* **Tertiary Palette**: Accent & highlight hue (Expressive Purple, `#7c3aed` base).
* **Neutral Palette**: Surfaces, backgrounds, and general text/icons.
* **Neutral Variant Palette**: Outlines, borders, dividers, and surface variants.
* **Error Palette**: Validation, destructive actions, and warnings (`#ba1a1a` base).

---

### 2.2 System Color Tokens & Semantic Roles

The application maps reference tones to semantic UI roles defined in `:root`.

> [!IMPORTANT]
> **Strict Light Theme Only**: Dark Mode has been completely removed and is prohibited from being re-implemented. Never add `@media (prefers-color-scheme: dark)`, `.dark` class selectors, or `dark:` utility variants.

#### Primary & Brand Roles
| Token Role | CSS Variable | Value (Hex) | Purpose / Usage |
| :--- | :--- | :--- | :--- |
| **Theme Blue (Icons & Buttons)** | `--md-sys-color-primary` / `#3b82f7` | `#3b82f7` | **Standard blue color for icons and buttons across the app's theme** |
| **Primary** | `--md-sys-color-primary` | `#1a56db` | High-emphasis buttons, active tabs, main FAB |
| **On Primary** | `--md-sys-color-on-primary` | `#ffffff` | Text & icons placed on top of `primary` |
| **Primary Container** | `--md-sys-color-primary-container` | `#dbeafe` | Standout badges, chip fills, soft action cards |
| **On Primary Container** | `--md-sys-color-on-primary-container` | `#1e3a8a` | Text & icons on `primary-container` |
| **Brand Title Accent** | `.brand-page-title` | `#3b82f7` | Expressive Roboto Flex page headings |

> [!TIP]
> **Theme Blue Rule (`#3b82f7`)**: Always use `#3b82f7` as the designated blue color for icons and action buttons for the app's theme.

#### Secondary Roles
| Token Role | CSS Variable | Value (Hex) | Purpose / Usage |
| :--- | :--- | :--- | :--- |
| **Secondary** | `--md-sys-color-secondary` | `#4f46e5` | Secondary buttons, filters, auxiliary badges |
| **On Secondary** | `--md-sys-color-on-secondary` | `#ffffff` | Text & icons on `secondary` |
| **Secondary Container** | `--md-sys-color-secondary-container` | `#ede9fe` | Soft interactive cards, selected filter pills |
| **On Secondary Container** | `--md-sys-color-on-secondary-container` | `#3730a3` | Text & icons on `secondary-container` |

#### Tertiary Roles (AI & Smart Features)
| Token Role | CSS Variable | Value (Hex) | Purpose / Usage |
| :--- | :--- | :--- | :--- |
| **Tertiary** | `--md-sys-color-tertiary` | `#7c3aed` | Gemini AI assistants, smart generation, sparks |
| **On Tertiary** | `--md-sys-color-on-tertiary` | `#ffffff` | Text & icons on `tertiary` |
| **Tertiary Container** | `--md-sys-color-tertiary-container` | `#f3e8ff` | AI suggestion chips, banner gradients |
| **On Tertiary Container**| `--md-sys-color-on-tertiary-container`| `#581c87` | Text & icons on `tertiary-container` |

#### Surface & Background Hierarchy
Material 3 uses **Tonal Elevation** (surface containers) rather than heavy drop shadows:
| Token Role | CSS Variable | Value (Hex) | Usage |
| :--- | :--- | :--- | :--- |
| **Background** | `--md-sys-color-background` | `#f8fafc` | Root app background |
| **On Background** | `--md-sys-color-on-background` | `#0f172a` | Primary body typography |
| **Surface** | `--md-sys-color-surface` | `#f8fafc` | Baseline container surface |
| **Surface Container Lowest** | `--md-sys-color-surface-container-lowest` | `#ffffff` | Cards, dialog modals, editor panels |
| **Surface Container Low** | `--md-sys-color-surface-container-low` | `#f1f5f9` | Navigation headers, modal footers |
| **Surface Container** | `--md-sys-color-surface-container` | `#e2e8f0` | Table headers, dropdown backgrounds |
| **Surface Container High**| `--md-sys-color-surface-container-high`| `#cbd5e1` | Floating action sheets, tooltips |
| **Surface Container Highest**| `--md-sys-color-surface-container-highest`| `#94a3b8` | Slider grooves, inactive progress tracks |
| **On Surface** | `--md-sys-color-on-surface` | `#0f172a` | High-emphasis content on surface |
| **On Surface Variant** | `--md-sys-color-on-surface-variant` | `#475569` | Medium-emphasis labels, helper text |
| **Outline** | `--md-sys-color-outline` | `#64748b` | Form field borders, active outlines |
| **Outline Variant** | `--md-sys-color-outline-variant` | `#e2e8f0` | Subtle dividers, card borders |

#### Functional & Feedback Roles
| Status | Container Token | On Container Token | Accent Hex |
| :--- | :--- | :--- | :--- |
| **Success** | `--md-sys-color-success-container` (`#dcfce7`) | `--md-sys-color-on-success-container` (`#14532d`) | `#15803d` |
| **Warning** | `--md-sys-color-warning-container` (`#fef3c7`) | `--md-sys-color-on-warning-container` (`#78350f`) | `#b45309` |
| **Error** | `--md-sys-color-error-container` (`#ffdad6`) | `--md-sys-color-on-error-container` (`#410002`) | `#ba1a1a` |

---

### 2.3 The Iconic Four-Color Progress Palette

In compliance with Google Material 3 guidelines for indeterminate AI generation & loading states, the app employs the dynamic Four-Color system:

```
[ Color 1: Blue ]  -->  [ Color 2: Red ]  -->  [ Color 3: Yellow ]  -->  [ Color 4: Green ]
     #3b82f7                 #ea4335                 #fbbc04                 #34a853
```

#### Token Definitions
```css
/* Light Theme */
--md-circular-progress-four-color-active-indicator-one-color: #3b82f7;
--md-circular-progress-four-color-active-indicator-two-color: #ea4335;
--md-circular-progress-four-color-active-indicator-three-color: #fbbc04;
--md-circular-progress-four-color-active-indicator-four-color: #34a853;

--md-linear-progress-four-color-active-indicator-one-color: #3b82f7;
--md-linear-progress-four-color-active-indicator-two-color: #ea4335;
--md-linear-progress-four-color-active-indicator-three-color: #fbbc04;
--md-linear-progress-four-color-active-indicator-four-color: #34a853;
```

#### Component Implementations:
- **AI Deck Generation Banner**:
  ```html
  <md-circular-progress four-color indeterminate style="--md-circular-progress-size: 46px;"></md-circular-progress>
  <md-linear-progress four-color indeterminate class="w-full" style="width: 100%;"></md-linear-progress>
  ```
- **Gemini Chat Assistant Loading State**:
  ```html
  <md-circular-progress id="chat-spinner" four-color indeterminate style="--md-circular-progress-size: 22px;"></md-circular-progress>
  ```

---

## 3. Typography System

### 3.1 Brand Expressive Variable Font: `Roboto Flex`

The main screen titles (`index.html`, `pages/generate.html`, `pages/stats.html`) feature Google's **Roboto Flex** variable font tuned with expressive parametric axes:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto+Flex:opsz,wdth,wght,XOPQ,XTRA,YOPQ,YTDE,YTFI,YTLC,YTUC@8..144,135,1000,154,518,53,-203,738,514,712&display=swap" rel="stylesheet">
```

#### Parametric Settings
```css
.brand-page-title {
  font-family: 'Roboto Flex', sans-serif !important;
  font-variation-settings: 
    'opsz' 144,   /* Optical size at 144 for display clarity */
    'wdth' 135,   /* Extended width for expressive presence */
    'wght' 1000,  /* Maximum ultra-heavy bold weight */
    'XOPQ' 154,   /* Thick stroke width */
    'XTRA' 518,   /* Extra font width proportion */
    'YOPQ' 53,    /* Vertical stroke width */
    'YTDE' -203,  /* Tail descender position */
    'YTFI' 738,   /* Figure height */
    'YTLC' 514,   /* Lowercase height */
    'YTUC' 712;   /* Uppercase height */
  font-weight: 1000 !important;
  color: #3b82f7 !important;
}
```

### 3.2 Material Typescale Hierarchy

| Role | Font Family | Size | Line Height | Tracking | Weight |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Display Large** | Roboto Flex | 57px | 64px | -0.25px | 1000 (axes) |
| **Headline Large** | Roboto Flex / Inter | 32px | 40px | 0px | 700 / 800 |
| **Headline Medium**| Inter | 28px | 36px | 0px | 600 |
| **Title Large** | Inter | 22px | 28px | 0px | 600 |
| **Title Medium** | Inter | 16px | 24px | +0.15px | 600 |
| **Body Large** | Inter / System | 16px | 24px | +0.5px | 400 |
| **Body Medium** | Inter / System | 14px | 20px | +0.25px | 400 |
| **Label Large** | Inter | 14px | 20px | +0.1px | 600 |
| **Label Small** | Inter | 11px | 16px | +0.5px | 500 |

### 3.3 Iconography
- **Material Symbols Rounded**: Standardised icon family self-hosted at `assets/fonts/material-symbols-rounded.woff2`.

---

## 4. Elevation, Shapes & Motion

### 4.1 Shape Corner Tokens
- `--md-sys-shape-corner-none`: `0px`
- `--md-sys-shape-corner-extra-small`: `4px` (tooltips, small badges)
- `--md-sys-shape-corner-small`: `8px` (compact buttons, sub-cards)
- `--md-sys-shape-corner-medium`: `12px` (input fields, menus)
- `--md-sys-shape-corner-large`: `16px` (main action buttons, cards)
- `--md-sys-shape-corner-extra-large`: `28px` (dialogs, upload container, dashboard cards)
- `--md-sys-shape-corner-full`: `9999px` (pills, segmented buttons, FABs)

### 4.2 Elevation Levels
- **Level 0**: Flat surface (`none`)
- **Level 1**: Subtle elevation (`0px 1px 3px 1px rgba(0,0,0,0.08)`) — Cards, table rows
- **Level 2**: Resting interactive (`0px 2px 6px 2px rgba(0,0,0,0.08)`) — Expressive cards, dropdowns
- **Level 3**: Overlays & Sheets (`0px 4px 12px 3px rgba(0,0,0,0.08)`) — Modal dialogs, sidebars
- **Level 4**: Floating elements (`0px 6px 16px 4px rgba(0,0,0,0.09)`) — Highlight popovers
- **Level 5**: High-elevation dialogs & prominent pickers (`0px 8px 24px 6px rgba(0,0,0,0.10)`)

### 4.3 Material Design 3 Motion System (M3 Motion Specs)

Reference: [Material Design 3 Motion Overview](https://m3.material.io/styles/motion/overview/how-it-works)

Motion in Material 3 is **informative**, **focused**, and **expressive**. The system establishes spatial continuity and mental models across navigation hierarchies using:

#### Easing Tokens
| Token | Cubic Bezier Curve | Usage |
| :--- | :--- | :--- |
| `--md-sys-motion-easing-emphasized` | `cubic-bezier(0.2, 0.0, 0, 1.0)` | Complete transitions beginning & ending on screen |
| `--md-sys-motion-easing-emphasized-decelerate` | `cubic-bezier(0.05, 0.7, 0.1, 1.0)` | Entering elements (panels, dialogs, toasts) |
| `--md-sys-motion-easing-emphasized-accelerate` | `cubic-bezier(0.3, 0.0, 0.8, 0.15)` | Exiting elements (sliding out, dismissing) |
| `--md-sys-motion-easing-standard` | `cubic-bezier(0.2, 0.0, 0, 1.0)` | Standard micro-interactions, state changes |
| `--md-sys-motion-easing-standard-decelerate` | `cubic-bezier(0.0, 0.0, 0.2, 1.0)` | Fast non-distracting entrances |
| `--md-sys-motion-easing-standard-accelerate` | `cubic-bezier(0.3, 0.0, 1.0, 1.0)` | Simple exits |
| `--md-sys-motion-easing-spring` | `cubic-bezier(0.34, 1.35, 0.64, 1.0)` | Bouncy interactive responses, switches, badges |

#### Duration Tokens
- **Short (50ms – 200ms)**: Micro-animations, checkbox/switch ticks, tooltip opacity.
- **Medium (250ms – 400ms)**: Tab switching, panel sliding, dialog zoom, drawer rollouts.
- **Long (450ms – 600ms)**: Complex container transforms, full-screen view reveals.

#### Transition Patterns Implemented
1. **Shared Axis X (Horizontal Peer Navigation)**:
   - Used for **Tabs** in `pages/stats.html` (`Sessão Atual` ↔ `Histórico` ↔ `Foco de Revisão`) and `pages/generate.html` (`Criador de Cards` ↔ `Assistente IA`).
   - Forward movement slides in from right (`+36px → 0px`), backward slides from left (`-36px → 0px`) with emphasized deceleration.
   - Powered by standard CSS classes and browser-native **View Transitions API** (`active-view-transition-type`).
2. **Fade Through (Hierarchical Navigation)**:
   - Used when switching between top-level destinations (e.g. `Dashboard` ↔ `Editor` in `pages/generate.html`).
   - Outgoing content scales down slightly and fades out; incoming content scales up (`scale(0.96) → 1.0`) with emphasized deceleration.
3. **Shared Axis Z / Container Dialogs**:
   - Used for modals and floating dialogs (`modalEnter`, scale `0.92 → 1.0` + translateY `12px → 0px`).
4. **Connected Deck Dynamic Border Radius (Grouped Shape Morphing)**:
   - Used for the editor deck card list (`#cards-list`), visually grouping cards into a connected M3 stack.
   - **First Card** (`.m3-card-shape-first`): Rounded top (`24px 24px 4px 4px`).
   - **Middle Cards** (`.m3-card-shape-mid`): Subtle rounded corners (`4px`).
   - **Last Card** (`.m3-card-shape-last`): Rounded bottom (`4px 4px 24px 24px`).
   - **Single Card** (`.m3-card-shape-single`): Fully rounded outer edges (`24px`).
   - Dynamically morphs with CSS transitions (`transition: border-radius var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized)`) when cards are added, deleted, or sectioned by divisors.
5. **Physical Elastic Collision Entrance (Shared Axis Y + Momentum)**:
   - Newly added cards enter from below (`translateY: 76px → -12px → 0px`), impacting the previous last card in the deck.
   - The struck previous card absorbs the collision impulse, shooting upward with elastic shock (`translateY: 0 → -20px`), then rebounds downward past equilibrium (`+7px`), and dampens smoothly back into place.
   - The editor viewport/container automatically auto-scrolls down (`scrollTo({ top: scrollHeight, behavior: 'smooth' })`) to keep the physical collision in full focus.
6. **Accessibility**:
   - Strictly respects `prefers-reduced-motion: reduce` by replacing spatial animations with instant transitions.

---

## 5. Material 3 Ripple & Interaction System

The application features a global, delegated **Material 3 Ripple Effect** via `js/ripple.js`:

```
Click / Touch Coordinate (x, y)
             ↓
[ Calculate Radius to Furthest Corner: hypot(dx, dy) ]
             ↓
[ Spawn .m3-ripple-wave in currentColor ]
             ↓
[ Scale 0 → 1 over 400ms via cubic-bezier(0.2, 0, 0, 1) ]
             ↓
[ Pointer Up / Leave → Smooth Opacity Fade-Out (300ms) ]
```

### Key Implementation Properties:
- **Natural Origin**: Originates directly under the user's cursor or fingertip.
- **Adaptive Tone**: Employs `currentColor` at `18%` opacity, guaranteeing matching light ripples on dark buttons and dark ripples on light buttons.
- **Universal Delegation**: Works automatically on all `<button>`, `.m3-btn-expressive`, `.tab-btn`, `[role="button"]`, and `.ripple-surface` elements—even dynamically generated cards and choices.
- **Non-blocking**: `pointer-events: none` and passive listener ensure 60fps scrolling and no interference with underlying form controls or handlers.

---

## 6. Component Architecture & Quick Reference

| Component | Class / Custom Element | Key Attributes / Styles |
| :--- | :--- | :--- |
| **Brand Title** | `h1.brand-page-title` | `font-family: 'Roboto Flex'`, `color: #3b82f7` |
| **Expressive Card** | `.m3-card-expressive` | `border-radius: 28px`, surface-container-lowest |
| **Filled Button** | `.m3-btn-expressive.m3-btn-filled` | `border-radius: 9999px`, primary container/fill |
| **Outlined Button** | `.m3-btn-expressive.m3-btn-outlined` | `border: 1px solid outline`, transparent background |
| **Circular Progress** | `<md-circular-progress>` | `four-color`, `indeterminate`, `--md-circular-progress-size` |
| **Linear Progress** | `<md-linear-progress>` | `four-color`, `indeterminate`, `--md-linear-progress-track-shape` |
| **Switch** | `<md-switch>` | `selected`, `disabled`, no icons/labels inside, spring animated handle |
| **Outlined Text Field** | `<md-outlined-text-field>` | `type="password"`, `label`, `supporting-text`, `--md-outlined-text-field-container-shape: 16px` |
| **Outlined Select Menu**| `.m3-select-trigger`, `.m3-select-dropdown` | M3 floating notched label, animated chevron, elevated container, active lavender pill |
| **Ripple Surface** | `button, .m3-btn-expressive` | Automated via `js/ripple.js` & `.m3-ripple-wave` |
| **Grouped Deck Card** | `.flashcard-item.m3-card-shape-*` | Dynamic radii: `24px` outer edges, `4px` inner seams, morphing transitions |
| **Elastic Entrance** | `.m3-card-elastic-in` / `hit` | 540ms/580ms momentum transfer, upward launch, damped oscillation & auto-scroll |
