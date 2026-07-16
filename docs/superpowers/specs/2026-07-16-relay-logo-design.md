# RelayTokenMonitor Logo Design

**Date:** 2026-07-16  
**Status:** Approved  
**Direction:** B · Relay node → B1 · Dual-arc hub → **no plate (transparent)**

## Goal

Replace the leftover DeepSeek whale tray/app icon with a product-owned mark for RelayTokenMonitor that reads as a relay / mid-hop at small sizes (especially Windows tray).

## Chosen concept

**Relay node mark (B1, no plate):**

- Left and right solid discs = client / upstream endpoints
- Center filled disc with white core = relay hub (brand blue gradient `#6b85ff → #4d6bfe`)
- Upper and lower arcs = data paths between endpoints and hub
- **No rounded square plate** — transparent background so the mark works on dark UI, light UI, and tray chrome
- At **16px**, drop the arcs; keep three discs only

## Color


| Role                | Value                              | Notes                            |
| ------------------- | ---------------------------------- | -------------------------------- |
| Hub gradient start  | `#6b85ff`                          | Matches existing `--brand-light` |
| Hub gradient end    | `#4d6bfe`                          | Matches existing `--brand`       |
| Endpoints (on dark) | `#e8ecff`                          | Soft light discs                 |
| Hub core            | `#ffffff`                          | Center punch                     |
| Arcs                | `#6b85ff` (lower arc ~55% opacity) |                                  |


No separate wordmark lockup. Product name stays system/UI type beside the mark when needed.

## Usage


| Surface                       | Treatment                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| System tray                   | Transparent PNG/ICO; 16px simplified (no arcs)                                                         |
| Installer / window icon       | Transparent preferred; optional dark plate only if a platform asset pipeline requires an opaque square |
| In-app brand (header / about) | Same SVG mark; replace Lucide `KeyRound` brand placeholder                                             |


## Deliverables (implementation)

1. Editable source SVG under something like `assets/brand/relay-mark.svg` (path TBD in plan)
2. Regenerated `src-tauri/icons/` set (PNG sizes + `.ico` / `.icns` as currently used)
3. Frontend brand icon component/SVG wired in place of `KeyRound` in the brand slot

## Out of scope

- Full marketing identity system / wordmark typography
- Animated logo
- Changing the existing UI theme tokens beyond using current brand blues in the mark

## Decision history

1. Approaches considered: A key+pulse, B relay node, C usage gauge → **B**
2. B variants: B1 dual-arc, B2 hex hub, B3 solid plate → **B1**
3. Plate: removed at user request → **transparent**
4. User approved 2026-07-16

