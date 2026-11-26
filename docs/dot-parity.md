# Rendered Dot parity

The linked cyan triangle with fur, sleepy lids and a yellow crown scores **99.8472% silhouette agreement** and **10.6798% exact foreground pixels** at 512 × 512. Its average foreground channel difference is 1.94 on a 0–255 scale. The 99.99% acceptance gate remains open. [Linked character close-up](dot-review/linked-character.png)

| Registered comparison | Cases | Median silhouette IoU | Median exact foreground | Median feature channel error, 0–255 | Cases passing all gates |
|---|---:|---:|---:|---:|---:|
| Builder and editor starters, 512 px | 96 | 99.9465% | 87.7223% | 1.40 | 0 |
| Held-out turns, depth settings and their neutral control, 384 px | 83 | 99.9419% | 89.0693% | 0.28 | 0 |
| Named catalog and its builder control, 512 px | 109 | 99.9257% | 45.4458% | 1.29 | 0 |

Each set contains a control image. Six editor starter portraits also appear in the catalog set. Each CSV contains one row per comparison. [Builder and starter scores](../golden/dots/metrics-neutral.csv) · [Rotation scores](../golden/dots/metrics-rotation.csv) · [Catalog scores](../golden/dots/metrics-catalog.csv)

## Unified studio regression check

The wardrobe integration was checked against the preceding port at commit `fa11315`. Both versions rendered the same 96 builder and starter cases, 83 rotation and depth cases, and 109 catalog cases through the public mount in headless Chromium using the same graphics backend. All 288 pairs had identical decoded RGBA bytes. The live-renderer scores above are a separate comparison. The transferred parts also have a [Blot body review plate](dot-review/blot-wardrobe.webp).

### Eyes, frames and shape changes

The Frog headphone mesh included a second pair of eye sockets. The headphone dye reached those sockets and the two surfaces competed for the same pixels. On the Blot Egg, the tall oval rims followed the changing depth of the cheek, which folded the upper rims during a turn. The fixes remove the duplicate sockets and seat a rigid pair of frames on the face. Both comparisons below use the same pose, colour and material before and after the change. [Frog and Egg close-ups](dot-review/frog-eyes-egg-frames.webp)

The editable Frog now uses the measured pale inset finish on its sockets. Against the two labelled socket regions in the archived neutral frame, the mean absolute RGB channel error fell from 7.71 to 1.74 on the left and from 13.66 to 1.91 on the right, on a 0–255 scale. On the four additional turns, near-white pixel error improved in the oblique, top and turned views. In the extreme side view it increased from 10.70 to 14.40 across 94 near-white pixels. The matte catalog retains its separately measured lighting.

The browser regression changes the Frog's headphones from charcoal to pink and checks every pixel in the region around both eyes. It also samples the first three frames after six successive shape selections with motion enabled and again under reduced motion. All 36 frames retained the material canvas. Run `npm run site` and `node scripts/wardrobe-check.mjs` with `PLAYWRIGHT_CORE` and `CHROMIUM` pointing to the local installations.

## What the gate measures

1. **Silhouette agreement** divides the intersection of the two masks by their union, using alpha ≥ 128.
2. **Exact foreground** counts pixels with identical premultiplied red, green, blue and alpha bytes. Its denominator includes every pixel occupied by either render, including translucent strands.
3. **Exact component** repeats the byte comparison on the portion changed by the eye, eyewear, extra or tint in either renderer. For the whole character, the component is the foreground. A small accessory therefore has its own score even on a large unchanged body.

A case passes when **each** ratio reaches 0.9999. The channel error describes the size of the remaining difference. Background pixels contribute to none of these percentages. The report uses the registered camera directly with no translation, colour correction, rescaling or post-comparison alignment.

## Reference and capture

The source was the live Dots editor and its renderer build `orbit-character-97341a6ccd8f9b7c/8a99a99685b92b37` on November 25–26, 2026. Four repeated captures and fresh instance controls for glossy, fur and Iris reproduced their original bytes. The port was captured through its public `dotAvatar` and `mount` entry points on the same AMD Radeon 890M and Chromium 152 browser as the reference. The material canvas was composited onto a transparent 512 or 384 px frame at a controlled neutral time. The wider diagnostic turns apply the same rotation to body, fittings and instanced fur draws. Ordinary pointer travel is smaller and was measured independently. The reference frames are development fixtures outside the npm distribution. [Reference frames](../golden/dots/reference) · [Source character](https://chatgpt.com/dots/5c7d15af6e7a2420aef2950b1dcac542089e0f756ae39e54921d9f2d4e5782cf~6b07bce089908192b6d9f7043c33109b)

The regular live stage adds two translucent floor layers and uses a different framing from the neutral capture. Fifteen isolated floor comparisons use alpha ≥ 1 for silhouette coverage. Their median exact premultiplied foreground and mean-channel-error scores are 41.46% and 0.28/255 respectively. The avatar comparisons above use alpha ≥ 128. [Floor scores](../golden/dots/metrics-ground.csv) · [Stage checkpoints](../golden/dots/stage-checkpoints.csv)

## Close-up review

Each comparison has the native image on the left, the port in the middle and four times the maximum per-channel absolute difference on the right. The crops use nearest-neighbour enlargement. The capture scripts generate an individual comparison for every row and paginate the contact sheets. Registered part-identification masks also separate 769 visible surfaces across 43 builder and starter configurations and all 108 catalog portraits. Two headphone pads, a bridge, an eye, its catchlight and a crown each get their own crop when visible. Each part score uses its actual visible pixels in the reference. The crop retains the surrounding surfaces to show alignment and occlusion. [Builder and starter part scores](../golden/dots/metrics-sections-neutral.csv) · [Catalog part scores](../golden/dots/metrics-sections-catalog.csv) · [Component masks](../golden/dots/sections)

| Component | Observed difference |
|---|---|
| Blossie’s beanie with round sunglasses | The glasses change the profile of both the cuff and the dome. A wearer-specific fit reduced average channel error on the visible beanie from 107.44 to 2.69. [Complete avatar](dot-review/wardrobe-blossie-beanie.png) · [Beanie close-up](dot-review/wardrobe-blossie-cuff.png) |
| Glossy cyan triangle | Mean channel error fell from 14.09 in the first attempt to 0.059. The outline reaches 99.9878% IoU and 94.9277% of occupied pixels match exactly. Small shifts in highlight position and antialiased coverage still change bytes. [Comparison](dot-review/base.png) |
| Sparkle capsules | The four-point insert and offset catch follow the curved eye. The eye-only exact fraction is 83.33%. Reflections and edge coverage account for visible differences. [Comparison](dot-review/eyes-sparkle_capsules.png) |
| Crescent inset | Fitting the pale socket, pupil and catchlight separately increased the eye-only exact fraction from 2.14% to 75.76%. The right catchlight has a mean channel error of 0.08. [Eye pair](dot-review/eyes-crescent_inset.png) · [Right catchlight](dot-review/crescent-catch.png) |
| Crown | The foreground includes the front and back walls and rounded tip beads. Fitting 55 enlarged depth and normal views reduced the crown-only mean channel error from 5.92 to 3.64. The bevels and polished reflections still differ. [Builder](dot-review/extra-crown.png) · [Linked crown](dot-review/linked-crown.png) · [Estelle’s crown](dot-review/estelle-crown.png) |
| Builder fur | Surface-bound grain survives a turn. The reference strand coverage and distribution still differ at the silhouette. [Held-out turn](dot-review/turn-fur.png) |
| Iris and Josh | Both use a separately measured portrait surface and curved eye inserts. Josh’s tuft and Iris’s monocle have their own surface responses. The remaining local variation is visible in the coat and hardware. [Iris](dot-review/preset-coral_monocle.png) · [Josh](dot-review/catalog-blue_spectacles.png) |
| Tavi | The matte flower body, monocle and beret have their own fits. The cuff and underside of the beret show the largest local surface error. [Comparison](dot-review/catalog-matisse.png) |

The 100 matte catalog rigs use ten fitted body volumes, 379 distinct measured component sections and 26 surface responses. The ten furry portraits across the two collections have independent hulls. Their coats use 36 views per portrait to estimate surface height and the way the grain responds as the head turns. The twelve builder coats use 22 views per body and a separate calibration across the ten dyes.

The live renderer also draws individual pile elements. At 512 px, suppressing the 5,759 instanced elements on the linked character changed 20,571 occupied pixels and moved 540 pixels across the silhouette threshold. The same experiment on the glossy control changed zero pixels. On Iris, the 512 px render included three instanced draws of 48,000, 26,875 and 26,875 elements. The portrait coats and eleven builder bodies use measured surface fields and translucent shells. The rounded triangle uses independently reconstructed, individually drawn tufts. [Isolated pile measurements](../golden/dots/fur-passes.json)

The rounded-triangle survey isolated each tuft by measuring the change in transmitted light when that tuft was added to the draw. It triangulated 8,186 centres across the 8,192 possible slots. At the 512 px reference framing, 5,759 slots are active. On a camera angle excluded from fitting, the median projected-centre error was 0.42 px and the 95th percentile was 1.17 px. At 768 px, 1,012 tuft observations determined the opacity profile along the long and short axes. Another 500 tested it. Their normalized absolute alpha error was 31.2%, compared with 39.8% for an elliptical Gaussian. Faint tufts and partly occluded tips still differ in local opacity. [Four individual tufts](dot-review/individual-fur.png) · [Tuft measurements](../golden/dots/tuft-measurements.json)

The review also includes a neutral round of all ten dyes and ten held-out turns with different dyes. On the neutral yellow triangle the mean foreground channel error decreased from 5.82 to 1.43. All ten turned dye views improved in both exact foreground agreement and mean channel error. [Yellow fur close-up](dot-review/fur-dye-yellow.png) · [Turn scores](../golden/dots/metrics-rotation.csv)

## Motion review

The 54 named clips were also checked at nine instants each. The comparison steps the public rig, assembles its body and both fitted eye inserts, and measures the displacement of local landmarks against the observed world transforms. At a 512 px framing, the body landmark error was 0.0165 px at the 95th percentile and 0.0531 px at maximum. The eye error was 0.0253 px and 0.0785 px respectively. The active Ready idle was also compared against 60 samples from the following cycle. At 512 px, body landmark displacement had a median of 0.0080 px, a 95th percentile of 1.4843 px and a maximum of 2.4939 px. The later live cycle included a spontaneous nod. These checkpoints measure motion geometry separately from rendered pixels. [Ready observations](../golden/dots/ready-checkpoints.json) [Motion observations](../golden/dots/motion-checkpoints.json) · [Comparison script](../scripts/dot-motion-compare.mjs)

A nine-second recording shows the linked character and the port responding to the same timed pointer positions, then settling after the pointer leaves. The camera uses the live stage framing. Two additional three-minute live Ready episodes used a stationary, centred pointer. Their five-second breathing rhythm recurred, while the timings of the short head tilts varied. [Side-by-side recording](dot-review/ready-and-cursor.mp4) · [Motion chart](dot-review/attention.png) · [Live episode samples](../golden/dots/ready-episodes.csv) · [Cursor step samples](../golden/dots/pointer-step.csv)

Two 100-second runs of the live renderer provide a repeatability control. Both used the linked recipe, Ready activity, a centred pointer and 60 clock steps per second. At 192 px, 54 of the 100 once-per-second image pairs matched exactly. In the other 46, exact foreground agreement fell below 99.99%, reaching 21.26% in the least similar pair. Independent live runs can therefore fail the frame-by-frame gate even when the renderer and inputs match. Deterministic pose captures and separately scored spontaneous behaviour distinguish this timing difference from material and geometry errors. [Native-to-native image scores](../golden/dots/ready-repeatability.csv)

The cursor tests include cases where the support stays fixed and its highlights travel independently. They cover a raised-socket face, Iris’s portrait and the largest catalog gaze error measured, Clover. [Held-out gaze observations](../golden/dots/gaze-checkpoints.json)

## Reproduce a comparison

Use Node 22, Chromium with WebGL2, Playwright Core, Python, NumPy and Pillow. Install the repository’s development dependencies with `npm ci`. Set `PLAYWRIGHT_CORE` to the installed module’s absolute path and `CHROMIUM` to the executable when they are outside the defaults.

```sh
node --import tsx scripts/dot-motion-compare.mjs
node --import tsx scripts/dot-capture.mjs .dot-review/candidate/neutral
DOT_TURNS=1 node --import tsx scripts/dot-capture.mjs .dot-review/candidate/rotation
DOT_CATALOG=1 node --import tsx scripts/dot-capture.mjs .dot-review/candidate/catalog
DOT_GROUND=1 node --import tsx scripts/dot-capture.mjs .dot-review/candidate/ground
python scripts/dot-compare.py golden/dots/reference/ground .dot-review/candidate/ground .dot-review/ground --alpha-threshold 1
for suite in neutral rotation catalog; do
  set --
  if [ -d "golden/dots/sections/$suite" ]; then
    set -- --sections "golden/dots/sections/$suite"
  fi
  python scripts/dot-compare.py "golden/dots/reference/$suite" \
    ".dot-review/candidate/$suite" ".dot-review/$suite" "$@"
done
```

The comparer returns exit status 1 while any case falls below the gate. It writes each case to `components/` under its report directory. With component masks, it also writes `section-metrics.csv` and a browsable `sections.html` gallery. The default command launches headless Chromium, whose graphics backend can change exact-byte results. The checked-in CSVs record the same-browser review described above. [Capture cases](../scripts/dot-cases.mjs) · [Capture entry point](../scripts/dot-capture-page.ts) · [Comparison code](../scripts/dot-compare.py)
