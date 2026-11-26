"""Compare registered renders at their native resolution. Requires Pillow and NumPy."""
import argparse
import csv
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

def report(reference, candidate, output):
    output.mkdir(parents=True, exist_ok=True)
    refs = sorted(reference.glob("*.png"))
    if not refs:
        raise ValueError("Reference directory is empty")
    base_r, base_c = read(reference / "base.png"), read(candidate / "base.png")
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
        am, bm = a[:, :, 3] >= 128, b[:, :, 3] >= 128
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
        y, x = np.where(feature)
        crop = (max(0,x.min()-4),max(0,y.min()-4),min(a.shape[1],x.max()+5),min(a.shape[0],y.max()+5))
        heat = Image.fromarray(np.uint8(np.minimum(255, errors.max(axis=2) * 4))).convert("RGB")
        tile = Image.new("RGB", (720,254), "white")
        ImageDraw.Draw(tile).text((4,2), name + "   reference / port / 4x channel error",fill="black")
        for j, image in enumerate((composite(a),composite(b),heat)):
            cropped = image.crop(crop)
            scale = min(236/cropped.width,230/cropped.height)
            enlarged = cropped.resize((round(scale*cropped.width),round(scale*cropped.height)),Image.Resampling.NEAREST)
            tile.paste(enlarged,(j*240+(240-enlarged.width)//2,19+(230-enlarged.height)//2))
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
    passed = sum(all(value >= .9999 for value in row[1:4]) for row in rows)
    print(f"{passed}/{len(rows)} passed all three 99.99% gates")
    return passed == len(rows)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for arg in ["reference", "candidate", "output"]:
        parser.add_argument(arg, type=Path)
    args = parser.parse_args()
    raise SystemExit(0 if report(**vars(args)) else 1)
