# Relay Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved B1 dual-arc relay mark (transparent, no plate) as editable SVG, Tauri tray/installer icons, and the in-app brand slot.

**Architecture:** One source SVG defines the full mark. A small Python+Pillow script rasterizes a 1024×1024 master PNG. `@tauri-apps/cli icon` regenerates `src-tauri/icons/*`. The React `BrandIcon` embeds the same geometry as inline SVG (no Lucide `KeyRound` in the brand slot). Settings section icons that mean “API key” keep `KeyRound`.

**Tech Stack:** SVG, Python 3 + Pillow, `@tauri-apps/cli` icon generator, React/TypeScript, Tauri 2 icon bundle paths already in `tauri.conf.json`.

**Spec:** `docs/superpowers/specs/2026-07-16-relay-logo-design.md`

---

## File structure (create / modify)

| Path | Responsibility |
|------|----------------|
| `assets/brand/relay-mark.svg` | Canonical editable mark (full arcs, transparent) |
| `assets/brand/relay-mark-16.svg` | 16px-simplified reference (three discs, no arcs) |
| `scripts/render-brand-icon.py` | Rasterize full mark → `assets/brand/relay-mark-1024.png` |
| `assets/brand/relay-mark-1024.png` | Master input for `tauri icon` |
| `src-tauri/icons/*` | Regenerated tray / window / NSIS icons |
| `src/main.tsx` | `BrandIcon` uses inline relay SVG |
| `src/styles.css` | Tweak `.relay-brand-icon` so transparent mark isn’t clipped oddly |

---

### Task 1: Canonical SVG sources

**Files:**
- Create: `assets/brand/relay-mark.svg`
- Create: `assets/brand/relay-mark-16.svg`

- [ ] **Step 1: Create the full mark SVG**

Write `assets/brand/relay-mark.svg` exactly:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none" role="img" aria-label="RelayTokenMonitor">
  <defs>
    <linearGradient id="hub" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6b85ff"/>
      <stop offset="100%" stop-color="#4d6bfe"/>
    </linearGradient>
  </defs>
  <circle cx="22" cy="64" r="12" fill="#e8ecff"/>
  <circle cx="106" cy="64" r="12" fill="#e8ecff"/>
  <path d="M36 54 C46 34, 82 34, 92 54" stroke="#6b85ff" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M36 74 C46 94, 82 94, 92 74" stroke="#6b85ff" stroke-width="5.5" stroke-linecap="round" opacity="0.55"/>
  <circle cx="64" cy="64" r="22" fill="url(#hub)"/>
  <circle cx="64" cy="64" r="9" fill="#ffffff"/>
</svg>
```

- [ ] **Step 2: Create the 16px simplified SVG**

Write `assets/brand/relay-mark-16.svg` exactly:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none" role="img" aria-label="RelayTokenMonitor">
  <defs>
    <linearGradient id="hub" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6b85ff"/>
      <stop offset="100%" stop-color="#4d6bfe"/>
    </linearGradient>
  </defs>
  <circle cx="20" cy="64" r="14" fill="#e8ecff"/>
  <circle cx="108" cy="64" r="14" fill="#e8ecff"/>
  <circle cx="64" cy="64" r="24" fill="url(#hub)"/>
  <circle cx="64" cy="64" r="9" fill="#ffffff"/>
</svg>
```

- [ ] **Step 3: Visually spot-check**

Open both SVGs in a browser or VS Code preview. Confirm: no square plate, hub gradient left→right light→brand blue, lower arc lighter than upper.

- [ ] **Step 4: Commit**

```powershell
git add assets/brand/relay-mark.svg assets/brand/relay-mark-16.svg
git commit -m "feat: add RelayTokenMonitor brand SVG marks"
```

---

### Task 2: Rasterize 1024 master PNG

**Files:**
- Create: `scripts/render-brand-icon.py`
- Create: `assets/brand/relay-mark-1024.png`

- [ ] **Step 1: Ensure Pillow is available**

```powershell
python -c "import PIL; print(PIL.__version__)"
```

Expected: a version string. If import fails:

```powershell
python -m pip install pillow
```

- [ ] **Step 2: Write the renderer**

Create `scripts/render-brand-icon.py`:

```python
"""Rasterize assets/brand/relay-mark.svg geometry to a 1024 PNG (transparent)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "brand" / "relay-mark-1024.png"
SIZE = 1024
SCALE = SIZE / 128.0


def sx(v: float) -> float:
    return v * SCALE


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Endpoints
    for cx in (22, 106):
        r = 12
        box = [sx(cx - r), sx(64 - r), sx(cx + r), sx(64 + r)]
        draw.ellipse(box, fill=(232, 236, 255, 255))

    # Arcs approximated as thick polylines (cubic samples)
    def cubic(p0, p1, p2, p3, n=48):
        pts = []
        for i in range(n + 1):
            t = i / n
            u = 1 - t
            x = u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0]
            y = u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1]
            pts.append((sx(x), sx(y)))
        return pts

    upper = cubic((36, 54), (46, 34), (82, 34), (92, 54))
    lower = cubic((36, 74), (46, 94), (82, 94), (92, 74))
    w = max(1, int(sx(5.5)))
    draw.line(upper, fill=(107, 133, 255, 255), width=w, joint="curve")
    draw.line(lower, fill=(107, 133, 255, 140), width=w, joint="curve")

    # Hub disc with linear gradient #6b85ff → #4d6bfe
    hub_r = 22
    hub = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    hub_draw = ImageDraw.Draw(hub)
    hub_draw.ellipse(
        [sx(64 - hub_r), sx(64 - hub_r), sx(64 + hub_r), sx(64 + hub_r)],
        fill=(255, 255, 255, 255),
    )
    # Paint gradient only inside hub mask
    grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = grad.load()
    x0, y0 = sx(64 - hub_r), sx(64 - hub_r)
    x1, y1 = sx(64 + hub_r), sx(64 + hub_r)
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            t = (x - x0) / max(1.0, (x1 - x0))
            r = int(107 + (77 - 107) * t)   # 6b→4d
            g = int(133 + (107 - 133) * t)  # 85→6b
            b = 255
            px[x, y] = (r, g, b, 255)
    hub = Image.composite(grad, Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0)), hub.split()[3])
    img = Image.alpha_composite(img, hub)

    # White core
    core_r = 9
    draw = ImageDraw.Draw(img)
    draw.ellipse(
        [sx(64 - core_r), sx(64 - core_r), sx(64 + core_r), sx(64 + core_r)],
        fill=(255, 255, 255, 255),
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Run the renderer**

```powershell
python scripts/render-brand-icon.py
```

Expected: prints `wrote ...\assets\brand\relay-mark-1024.png` and the file exists (~1024×1024, transparent corners).

- [ ] **Step 4: Spot-check the PNG**

Open `assets/brand/relay-mark-1024.png`. Confirm transparent background (no square plate) and readable three-node mark.

- [ ] **Step 5: Commit**

```powershell
git add scripts/render-brand-icon.py assets/brand/relay-mark-1024.png
git commit -m "feat: add brand icon rasterizer and 1024 master PNG"
```

---

### Task 3: Regenerate Tauri icon set

**Files:**
- Modify: `src-tauri/icons/32x32.png`
- Modify: `src-tauri/icons/128x128.png`
- Modify: `src-tauri/icons/128x128@2x.png`
- Modify: `src-tauri/icons/icon.ico`
- Modify: `src-tauri/icons/icon.icns`
- Modify: other generated files under `src-tauri/icons/` that `tauri icon` rewrites (Square* / StoreLogo / icon.png)

- [ ] **Step 1: Generate icons from the master PNG**

From repo root:

```powershell
npx --yes @tauri-apps/cli icon assets/brand/relay-mark-1024.png -o src-tauri/icons
```

Expected: command exits 0; `src-tauri/icons/icon.ico`, `32x32.png`, `128x128.png`, `icon.png` update to the relay mark (no whale).

- [ ] **Step 2: Confirm `tauri.conf.json` still points at the same paths**

No edit needed if paths remain:

```json
"icon": [
  "icons/32x32.png",
  "icons/128x128.png",
  "icons/128x128@2x.png",
  "icons/icon.icns",
  "icons/icon.ico"
]
```

- [ ] **Step 3: Commit**

```powershell
git add src-tauri/icons
git commit -m "feat: replace tray and installer icons with relay mark"
```

---

### Task 4: Wire in-app BrandIcon

**Files:**
- Modify: `src/main.tsx` (replace `BrandIcon` body; keep `KeyRound` imports for keys/settings sections)
- Modify: `src/styles.css` (`.brand-icon` / `.relay-brand-icon`)

- [ ] **Step 1: Replace `BrandIcon` with inline SVG**

In `src/main.tsx`, replace the `BrandIcon` function with:

```tsx
function BrandIcon({ size = 32 }: { size?: number }) {
  return (
    <div className="brand-icon relay-brand-icon" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 128 128" width="100%" height="100%" fill="none">
        <defs>
          <linearGradient id="relayHub" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6b85ff" />
            <stop offset="100%" stopColor="#4d6bfe" />
          </linearGradient>
        </defs>
        <circle cx="22" cy="64" r="12" fill="#e8ecff" />
        <circle cx="106" cy="64" r="12" fill="#e8ecff" />
        <path
          d="M36 54 C46 34, 82 34, 92 54"
          stroke="#6b85ff"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
        <path
          d="M36 74 C46 94, 82 94, 92 74"
          stroke="#6b85ff"
          strokeWidth="5.5"
          strokeLinecap="round"
          opacity="0.55"
        />
        <circle cx="64" cy="64" r="22" fill="url(#relayHub)" />
        <circle cx="64" cy="64" r="9" fill="#ffffff" />
      </svg>
    </div>
  );
}
```

Do **not** remove `KeyRound` from the lucide import list while it is still used for the keys panel / access-token section / keys nav button.

- [ ] **Step 2: Soften brand chrome so it doesn’t fake a logo plate**

In `src/styles.css`, update:

```css
.brand-icon {
  display: grid;
  place-items: center;
  overflow: visible;
  border-radius: 0;
  background: transparent;
}

.relay-brand-icon {
  display: grid;
  place-items: center;
  border-radius: 0;
  background: transparent;
}
```

- [ ] **Step 3: Typecheck**

```powershell
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Manual UI check**

```powershell
npm run tauri:dev
```

Expected: header brand shows the dual-arc relay mark (no key glyph, no square plate); tray icon is the new mark after restart; keys/settings still use `KeyRound` where appropriate.

- [ ] **Step 5: Commit**

```powershell
git add src/main.tsx src/styles.css
git commit -m "feat: use relay mark for in-app brand icon"
```

---

### Task 5: Progress note

**Files:**
- Modify: `docs/superpowers/progress.md` (short note that logo assets landed)

- [ ] **Step 1: Append a progress bullet**

Add a dated line noting logo SVG + Tauri icons + BrandIcon wired per `2026-07-16-relay-logo-design.md`.

- [ ] **Step 2: Commit**

```powershell
git add docs/superpowers/progress.md
git commit -m "docs: note relay logo implementation in progress log"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| B1 dual-arc hub, transparent, no plate | Task 1 SVG + Task 2 PNG |
| Colors `#6b85ff` / `#4d6bfe` / `#e8ecff` / white core | Task 1–2, Task 4 |
| 16px simplified (no arcs) | Task 1 `relay-mark-16.svg` (reference; OS scales full mark for tray) |
| Tray / installer / window icons | Task 3 |
| In-app brand replaces `KeyRound` brand slot | Task 4 |
| No fancy wordmark | Out of scope — not scheduled |
| Optional opaque plate only if required | Not generating a plate by default |

## Placeholder scan

No TBD / “implement later” / “add tests later” left in tasks.

## Type consistency

Geometry constants match across SVG, Python renderer, and React SVG (`viewBox 0 0 128 128`, hub r=22, core r=9, endpoints at x=22/106).
