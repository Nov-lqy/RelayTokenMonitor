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
    hub_mask = Image.new("L", (SIZE, SIZE), 0)
    hub_mask_draw = ImageDraw.Draw(hub_mask)
    hub_mask_draw.ellipse(
        [sx(64 - hub_r), sx(64 - hub_r), sx(64 + hub_r), sx(64 + hub_r)],
        fill=255,
    )
    grad = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = grad.load()
    x0, y0 = sx(64 - hub_r), sx(64 - hub_r)
    x1, y1 = sx(64 + hub_r), sx(64 + hub_r)
    for y in range(int(y0), int(y1) + 1):
        for x in range(int(x0), int(x1) + 1):
            t = (x - x0) / max(1.0, (x1 - x0))
            r = int(107 + (77 - 107) * t)  # 6b→4d
            g = int(133 + (107 - 133) * t)  # 85→6b
            b = 255
            px[x, y] = (r, g, b, 255)
    hub = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    hub.paste(grad, (0, 0), hub_mask)
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
