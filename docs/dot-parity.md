# Rendered Dot parity

The linked cyan triangle with fur, sleepy lids and a yellow crown scores **99.5035% silhouette agreement** and **3.7144% exact foreground pixels** at 512 × 512. Its average foreground channel difference is 4.13 on a 0–255 scale. The 99.99% acceptance gate remains open. [Linked character close-up](dot-review/linked-character.png)

| Registered comparison | Cases | Median silhouette IoU | Median exact foreground | Median feature channel error, 0–255 | Cases passing all gates |
|---|---:|---:|---:|---:|---:|
| Builder and editor starters, 512 px | 75 | 99.9648% | 83.0330% | 1.53 | 0 |
| Held-out turns and their neutral control, 384 px | 19 | 99.7981% | 71.3098% | 0.86 | 0 |
| Named catalog and its builder control, 512 px | 109 | 99.8720% | 10.7367% | 2.23 | 0 |

Each set contains a control image. Six editor starter portraits also appear in the catalog set. Each CSV contains one row per comparison. [Builder and starter scores](../golden/dots/metrics-neutral.csv) · [Rotation scores](../golden/dots/metrics-rotation.csv) · [Catalog scores](../golden/dots/metrics-catalog.csv)

## What the gate measures

1. **Silhouette agreement** divides the intersection of the two masks by their union, using alpha ≥ 128.
2. **Exact foreground** counts pixels with identical premultiplied red, green, blue and alpha bytes. Its denominator includes every pixel occupied by either render, including translucent strands.
3. **Exact component** repeats the byte comparison on the portion changed by the eye, eyewear, extra or tint in either renderer. For the whole character, the component is the foreground. A small accessory therefore has its own score even on a large unchanged body.

A case passes when **each** ratio reaches 0.9999. The channel error describes the size of the remaining difference. Background pixels contribute to none of these percentages. The report uses the registered camera directly with no translation, colour correction, rescaling or post-comparison alignment.

## Reference and capture

The source was the live Dots editor and its renderer build `orbit-character-97341a6ccd8f9b7c/8a99a99685b92b37` on November 25–26, 2026. Four repeated captures and fresh instance controls for glossy, fur and Iris reproduced their original bytes. The port was captured through its public `dotAvatar` and `mount` entry points on the same AMD Radeon 890M and Chromium 152 browser as the reference. The material canvas was composited onto a transparent 512 or 384 px frame at a controlled neutral time. The wider diagnostic turns apply the same rotation to body, fittings and instanced fur draws. Ordinary pointer travel is smaller and was measured independently. The reference frames are development fixtures outside the npm distribution. [Reference frames](../golden/dots/reference) · [Source character](https://chatgpt.com/dots/5c7d15af6e7a2420aef2950b1dcac542089e0f756ae39e54921d9f2d4e5782cf~6b07bce089908192b6d9f7043c33109b)

## Close-up review

Each comparison has the native image on the left, the port in the middle and four times the maximum per-channel absolute difference on the right. The crops use nearest-neighbour enlargement. The capture scripts generate an individual comparison for every row and paginate the contact sheets.

| Component | Observed difference |
|---|---|
| Glossy cyan triangle | Mean channel error fell from 14.09 in the first attempt to 0.13. The outline reaches 99.9837% IoU. Small shifts in highlight position and antialiased coverage still change bytes. [Comparison](dot-review/base.png) |
| Sparkle capsules | The four-point insert and offset catch follow the curved eye. The eye-only exact fraction is 68.86%. Reflections and edge coverage account for visible differences. [Comparison](dot-review/eyes-sparkle_capsules.png) |
| Crown | The foreground includes the front and back walls and rounded tip beads. The fitted band, bevels and polished reflections differ at close range. [Comparison](dot-review/extra-crown.png) |
| Builder fur | Surface-bound grain survives a turn. The reference strand coverage and distribution still differ at the silhouette. [Held-out turn](dot-review/turn-fur.png) |
| Iris and Josh | Both use a separately measured portrait surface and curved eye inserts. Josh’s tuft and Iris’s monocle have their own surface responses. The remaining local variation is visible in the coat and hardware. [Iris](dot-review/preset-coral_monocle.png) · [Josh](dot-review/catalog-blue_spectacles.png) |
| Tavi | The matte flower body, monocle and beret have their own fits. The cuff and underside of the beret show the largest local surface error. [Comparison](dot-review/catalog-matisse.png) |

The 100 matte catalog rigs use ten fitted body volumes, 379 distinct measured component sections and 26 surface responses. The ten furry portraits across the two collections have independent hulls. Their optical-density fields use 24 calibration orientations each. The neutral view was withheld from that field fit. Across these portraits its high-frequency correlation ranges from 0.44 to 0.80. This measures coat detail in isolation.

## Motion review

The 54 named clips were also checked at nine instants each. The comparison steps the public rig, assembles its body and both fitted eye inserts, and measures the displacement of local landmarks against the observed world transforms. At a 512 px framing, the body landmark error was 0.0165 px at the 95th percentile and 0.0531 px at maximum. The eye error was 0.0253 px and 0.0785 px respectively. These checkpoints measure motion geometry separately from rendered pixels. [Motion observations](../golden/dots/motion-checkpoints.json) · [Comparison script](../scripts/dot-motion-compare.mjs)

The cursor tests include cases where the support stays fixed and its highlights travel independently. They cover a raised-socket face, Iris’s portrait and the largest catalog gaze error measured, Clover. [Held-out gaze observations](../golden/dots/gaze-checkpoints.json)

## Reproduce a comparison

Use Node 22, Chromium with WebGL2, Playwright Core, Python, NumPy and Pillow. Install the repository’s development dependencies with `npm ci`. Set `PLAYWRIGHT_CORE` to the installed module’s absolute path and `CHROMIUM` to the executable when they are outside the defaults.

```sh
node --import tsx scripts/dot-motion-compare.mjs
node --import tsx scripts/dot-capture.mjs .dot-review/candidate/neutral
DOT_TURNS=1 node --import tsx scripts/dot-capture.mjs .dot-review/candidate/rotation
DOT_CATALOG=1 node --import tsx scripts/dot-capture.mjs .dot-review/candidate/catalog
for suite in neutral rotation catalog; do
  python scripts/dot-compare.py "golden/dots/reference/$suite" \
    ".dot-review/candidate/$suite" ".dot-review/$suite"
done
```

The comparer returns exit status 1 while any case falls below the gate. It writes the individual images to `components/` under each report directory. The default command launches headless Chromium, whose graphics backend can change exact-byte results. The checked-in CSVs record the same-browser review described above. [Capture cases](../scripts/dot-cases.mjs) · [Capture entry point](../scripts/dot-capture-page.ts) · [Comparison code](../scripts/dot-compare.py)
