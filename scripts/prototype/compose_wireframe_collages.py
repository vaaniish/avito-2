from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw


CANVAS_BG = "#FFFFFF"
IMAGE_BORDER = "#2B2B2B"

PAGE_CROPS: dict[str, list[tuple[str, int]]] = {
    "public": [
        ("catalog", 760),
        ("product-detail", 620),
        ("seller-store", 520),
    ],
    "private": [
        ("admin-listings", 660),
        ("checkout", 560),
        ("profile-orders", 520),
    ],
}


def fit_size(width: int, height: int, max_width: int, max_height: int) -> tuple[int, int]:
    ratio = min(max_width / width, max_height / height)
    return max(1, int(width * ratio)), max(1, int(height * ratio))


def open_focus_image(path: Path, focus_height: int) -> Image.Image:
    image = Image.open(path).convert("RGB")
    crop_height = min(image.height, focus_height)
    return image.crop((0, 0, image.width, crop_height))


def compose_collage(
    collage_id: str,
    output_path: Path,
    screens: list[dict],
    canvas_width: int,
    canvas_height: int,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)

    screen_by_id = {screen["id"]: screen for screen in screens}
    layout = PAGE_CROPS[collage_id]

    margin_x = 52
    margin_y = 52
    gutter_y = 34
    available_width = canvas_width - margin_x * 2
    available_height = canvas_height - margin_y * 2 - gutter_y * (len(layout) - 1)
    slot_height = available_height // len(layout)

    canvas = Image.new("RGB", (canvas_width, canvas_height), CANVAS_BG)
    draw = ImageDraw.Draw(canvas)

    current_y = margin_y
    for screen_id, crop_height in layout:
        screen = screen_by_id[screen_id]
        image = open_focus_image(Path(screen["wireframePath"]), crop_height)
        inner_width, inner_height = fit_size(image.width, image.height, available_width, slot_height)
        image = image.resize((inner_width, inner_height), Image.Resampling.LANCZOS)

        image_x = margin_x + (available_width - inner_width) // 2
        image_y = current_y + (slot_height - inner_height) // 2
        canvas.paste(image, (image_x, image_y))
        draw.rectangle(
            (image_x, image_y, image_x + inner_width, image_y + inner_height),
            outline=IMAGE_BORDER,
            width=2,
        )
        current_y += slot_height + gutter_y

    canvas.save(output_path, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf8"))
    canvas_width = int(manifest["canvas"]["width"])
    canvas_height = int(manifest["canvas"]["height"])

    screens_by_collage: dict[str, list[dict]] = {}
    for screen in manifest["screens"]:
        screens_by_collage.setdefault(screen["collage"], []).append(screen)

    for collage in manifest["collages"]:
        collage_id = collage["id"]
        screens = screens_by_collage.get(collage_id, [])
        if not screens:
            continue
        compose_collage(
            collage_id,
            Path(collage["outputPath"]),
            screens,
            canvas_width,
            canvas_height,
        )


if __name__ == "__main__":
    main()
