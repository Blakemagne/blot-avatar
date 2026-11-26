"""Compare registered renders at their native resolution. Requires Pillow and NumPy."""
import argparse
import csv
import html
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

def read(path):
    rgba = np.asarray(Image.open(path).convert("RGBA"), dtype=np.int32)
    rgba[:, :, :3] = (rgba[:, :, :3] * rgba[:, :, 3:] + 127) // 255
    return rgba

def ratio(matches, mask):
    return np.count_nonzero(matches & mask) / max(1, np.count_nonzero(mask))

def composite(rgba):
    return Image.fromarray(np.uint8(rgba[:, :, :3] + (255 - rgba[:, :, 3:]) * 200 // 255))

def close_up(name, images, region):
    y, x = np.where(region)
    crop = (max(0, x.min()-4), max(0, y.min()-4),
            min(region.shape[1], x.max()+5), min(region.shape[0], y.max()+5))
    tile = Image.new("RGB", (720, 254), "white")
    ImageDraw.Draw(tile).text((4, 2), name + "   reference / port / 4x channel error", fill="black")
    for j, image in enumerate(images):
        cropped = image.crop(crop)
        scale = min(236/cropped.width, 230/cropped.height)
        enlarged = cropped.resize((max(1, round(scale*cropped.width)), max(1, round(scale*cropped.height))),
                                  Image.Resampling.NEAREST)
        tile.paste(enlarged, (j*240+(240-enlarged.width)//2, 19+(230-enlarged.height)//2))
    return tile

def review_sections(name, mask_path, labels, images, exact, errors, output):
    mask = np.asarray(Image.open(mask_path).convert("L"))
    if mask.shape != exact.shape or mask.max() > len(labels):
        raise ValueError(f"Section labels or framing differ for {name}")
    folder = output / "sections" / name
    folder.mkdir(parents=True, exist_ok=True)
    records = []
    for index, label in enumerate(labels, 1):
        occupied = mask == index
        count = np.count_nonzero(occupied)
        if not count:
            continue
        title = f"{name} — {label} {index}"
        filename = f"{index:02d}-{label}.png"
        close_up(title, images, occupied).save(folder / filename)
        records.append((name, index, label, count, ratio(exact, occupied), errors[occupied].mean(),
                        (folder / filename).relative_to(output).as_posix()))
    return records

def report(reference, candidate, output, sections=None, alpha_threshold=128):
    output.mkdir(parents=True, exist_ok=True)
    refs = sorted(reference.glob("*.png"))
    if not refs:
        raise ValueError("Reference directory is empty")
    base_r, base_c = read(reference / "base.png"), read(candidate / "base.png")
    labels = json.loads((sections / "labels.json").read_text()) if sections else {}
    section_rows = []
    rows = []
    tiles = {}
    components = output / "components"
    components.mkdir(exist_ok=True)
    for path in refs:
        name = path.stem
        a, b = read(path), read(candidate / path.name)
        if a.shape != b.shape:
            raise ValueError(f"{name}: dimensions differ")
        occupied = (a[:, :, 3] > 0) | (b[:, :, 3] > 0)
        am, bm = a[:, :, 3] >= alpha_threshold, b[:, :, 3] >= alpha_threshold
        errors = np.abs(a - b)
        exact = errors.max(axis=2) == 0
        category = name.split("-")[0]
        feature = occupied.copy()
        if category in ("eyes", "glasses", "extra", "tint"):
            # Isolate the pixels changed by adding this component in either renderer.
            feature &= ((a != base_r) | (b != base_c)).any(axis=2)
        if not feature.any():
            raise ValueError(f"{name}: no visible feature")
        iou = ratio(am & bm, am | bm)
        match = ratio(exact, occupied)
        detail = ratio(exact, feature)
        rows.append((name, iou, match, detail, errors[feature].mean(), np.count_nonzero(feature)))
        heat = Image.fromarray(np.uint8(np.minimum(255, errors.max(axis=2) * 4))).convert("RGB")
        images = (composite(a), composite(b), heat)
        tile = close_up(name, images, feature)
        if name in labels:
            section_rows.extend(review_sections(name, sections / path.name, labels[name], images, exact, errors, output))
        tile.save(components / (name + ".png"))
        tiles.setdefault(category, []).append(tile)
    for category, group in tiles.items():
        for start in range(0, len(group), 6):
            page = group[start:start + 6]
            sheet = Image.new("RGB", (720, 254 * len(page)), "white")
            for i, tile in enumerate(page):
                sheet.paste(tile, (0, 254 * i))
            suffix = f"-{start // 6 + 1:02d}" if len(group) > 6 else ""
            sheet.save(output / (category + suffix + ".png"))
    with (output/"metrics.csv").open("w",newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(("case","silhouette_iou","exact_foreground","exact_feature","mean_feature_channel_error","feature_pixels"))
        writer.writerows(rows)
    if section_rows:
        with (output / "section-metrics.csv").open("w", newline="") as stream:
            writer = csv.writer(stream, lineterminator="\n")
            writer.writerow(("case", "section", "role", "visible_pixels", "exact_pixels_fraction", "mean_channel_error", "close_up"))
            writer.writerows(section_rows)
        groups = {}
        for name, index, role, count, match, error, uri in section_rows:
            groups.setdefault(name, []).append(f'<a href="{html.escape(uri)}"><img loading="lazy" src="{html.escape(uri)}" '
                                               f'alt="{html.escape(name)} {html.escape(role)} {index}"></a>')
        sections_html = "".join(f"<details><summary>{html.escape(name)} ({len(items)})</summary>"
                                + "".join(items) + "</details>" for name, items in groups.items())
        (output / "sections.html").write_text('<!doctype html><meta charset="utf-8"><title>Dot component comparisons</title>'
            '<style>body{font:1rem system-ui;max-width:75rem;margin:2rem auto}summary{cursor:pointer;padding:.4rem}'
            'img{display:block;width:min(100%,720px);height:auto}</style><h1>Dot component comparisons</h1>'
            '<p>Reference, port and amplified difference. Each score uses the visible pixels of the named part.</p>' + sections_html)
        print(f"{len(section_rows)} visible sections reviewed")
    passed = sum(all(value >= .9999 for value in row[1:4]) for row in rows)
    print(f"{passed}/{len(rows)} passed all three 99.99% gates")
    return passed == len(rows)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ["reference", "candidate", "output"]:
        parser.add_argument(arg, type=Path)
    parser.add_argument("--sections", type=Path, help="Registered component masks and labels.json")
    parser.add_argument("--alpha-threshold", type=int, default=128, help="Use 1 for isolated translucent floor layers")
    args = parser.parse_args()
    raise SystemExit(0 if report(**vars(args)) else 1)
