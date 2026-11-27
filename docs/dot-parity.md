# Rendered Dot parity

The linked cyan triangle with fur, sleepy lids and a yellow crown scores **99.8472% silhouette agreement** and **10.6798% exact foreground pixels** at 512 × 512. Its average foreground channel difference is 1.94 on a 0–255 scale. The 99.99% acceptance gate remains open. [Linked character close-up](dot-review/linked-character.png)

| Registered comparison | Cases | Median silhouette IoU | Median exact foreground | Median feature channel error, 0–255 | Cases passing all gates |
|---|---:|---:|---:|---:|---:|
| Builder and editor starters, 512 px | 96 | 99.9465% | 87.7223% | 1.22 | 0 |
| Held-out turns, depth settings and their neutral control, 384 px | 83 | 99.9419% | 89.0693% | 0.27 | 0 |
| named catalog and its builder control, 512 px | 109 | 99.9257% | 47.0655% | 0.87 | 0 |
| ground layers, alpha ≥ 1 | 15 | 98.3947% | 41.2159% | 0.28 | 0 |

Each set contains a control image. Six editor starter portraits also appear in the catalog set. Each CSV contains one row per comparison. [Builder and starter scores](../golden/dots/metrics-neutral.csv) · [Rotation scores](../golden/dots/metrics-rotation.csv) · [catalog scores](../golden/dots/metrics-catalog.csv) · [ground scores](../golden/dots/metrics-ground.csv)

[wardrobe transfer review and before/after close-ups](wardrobe-review.md)

## Unified studio regression check

The wardrobe integration was checked against the preceding port at commit `fa11315`. Both versions rendered the same 96 builder and starter cases, 83 rotation and depth cases, and 109 catalog cases through the public mount in headless Chromium using the same graphics backend. All 288 pairs had identical decoded RGBA bytes. The live-renderer scores above are a separate comparison. The transferred parts also have a [Blot body review plate](dot-review/blot-wardrobe.webp).

### Eyes, frames and shape changes

The Frog headphone mesh included a second pair of eye sockets. The headphone dye reached those sockets and the two surfaces competed for the same pixels. On the Blot Egg, the tall oval rims followed the changing depth of the cheek, which folded the upper rims during a turn. The fixes remove the duplicate sockets and seat a rigid pair of frames on the face. Both comparisons below use the same pose, colour and material before and after the change. [Frog and Egg close-ups](dot-review/frog-eyes-egg-frames.webp)

The reference builder frog uses the measured pale inset finish on its sockets. Against the two labelled socket regions in the archived neutral frame, the mean absolute RGB channel error fell from 7.71 to 1.74 on the left and from 13.66 to 1.91 on the right, on a 0–255 scale. On the four additional turns, near-white pixel error improved in the oblique, top and turned views. In the extreme side view it increased from 10.70 to 14.40 across 94 near-white pixels. The matte catalog retains its separately measured lighting.

The browser regression changes the Frog's headphones from charcoal to pink and checks every pixel in the region around both eyes. It also samples the first three frames after six successive shape selections with motion enabled and again under reduced motion. All 36 frames retained the material canvas. Run `npm run site` and `node scripts/wardrobe-check.mjs` with `PLAYWRIGHT_CORE` and `CHROMIUM` pointing to the local installations.

## What the gate measures

1. **Silhouette agreement** divides the intersection of the two masks by their union, using alpha ≥ 128.
2. **Exact foreground** counts pixels with identical premultiplied red, green, blue and alpha bytes. Its denominator includes every pixel occupied by either render, including translucent strands.
3. **Exact component** repeats the byte comparison on the portion changed by the eye, eyewear, extra or tint in either renderer. For the whole character, the component is the foreground. A small accessory therefore has its own score even on a large unchanged body.

A case passes when **each** ratio reaches 0.9999. The channel error describes the size of the remaining difference. Background pixels contribute to none of these percentages. The report uses the registered camera directly with no translation, colour correction, rescaling or post-comparison alignment.

## Reference and capture

The source was the live Dots editor and its renderer build `orbit-character-97341a6ccd8f9b7c/8a99a99685b92b37` on November 25–26, 2026. Four repeated captures and fresh instance controls for glossy, fur and Iris reproduced their original bytes. The port was captured through its public `dotAvatar` and `mount` entry points on the same AMD Radeon 890M and Chromium 152 browser as the reference. The material canvas was composited onto a transparent 512 or 384 px frame at a controlled neutral time. The wider diagnostic turns apply the same rotation to body, fittings and instanced fur draws. Ordinary pointer travel is smaller and was measured independently. The reference frames are development fixtures outside the npm distribution. [Reference frames](../golden/dots/reference) · [Source character](https://chatgpt.com/dots/5c7d15af6e7a2420aef2950b1dcac542089e0f756ae39e54921d9f2d4e5782cf~6b07bce089908192b6d9f7043c33109b)

The regular live stage adds two translucent floor layers and uses a different framing from the neutral capture. Fifteen isolated floor comparisons use alpha ≥ 1 for silhouette coverage. Their median exact premultiplied foreground and mean-channel-error scores are 41.22% and 0.28/255 respectively. The avatar comparisons above use alpha ≥ 128. [Floor scores](../golden/dots/metrics-ground.csv) · [Stage checkpoints](../golden/dots/stage-checkpoints.csv)

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

a second repeatability check used fresh native instances of the cyan fur triangle with oval eyes and no accessories. each instance rendered 6,000 steps at 60 hz, centred on a transparent 192 px canvas. each pair started with the same javascript random seed and byte sequence for browser entropy. 91 of 100 one-second samples matched. fixing the wall clock and monotonic clock as well produced 89 matches in a fresh pair. the least similar pair in that run matched 11.80% of occupied RGBA pixels. these comparisons measure the native renderer against itself and use the union of the two painted areas. [per-second counts](../golden/dots/ready-clock-repeatability.csv)

The cursor tests include cases where the support stays fixed and its highlights travel independently. They cover a raised-socket face, Iris’s portrait and the largest catalog gaze error measured, Clover. [Held-out gaze observations](../golden/dots/gaze-checkpoints.json)

### eye placement during activities

the orbit and radar activities replace a dressed wearer with a smaller disc. both eyes now move onto that disc as it forms, including when the previous pose had only one visible eye. the studio review exercised five activity controls on todd, alfred, sunny, a circle and a teardrop. the three-dot loader, ring and progress bar each have their own faceless design. [studio activity captures](dot-review/activity-figure-review.webp)

in the reference builder frog, the pupils move independently of their white sockets. todd moves both layers. the 538 sampled poses of these two rigs matched the observed landmarks within 0.049 px at 512 px framing. across nine other faces, 95% of the 396 sampled eye components landed within 0.133 px. the 120 measurements on sunny, clover and tavi had a 95th-percentile error of 0.228 px. the oval eyes on ten different shells ranged up to 2.084 px from the reference across six activities. the comparison measures three-dimensional displacement in pixel units before rasterization. the SVG renderer also moves iris’s glints independently of her dark eye supports. [socket observations](../golden/dots/socket-motion-checkpoints.json) · [eye observations](../golden/dots/insert-motion-checkpoints.json) · [oval observations](../golden/dots/oval-motion-checkpoints.json)

the unified studio’s frog shape now shares todd’s socket and pupil meshes, gaze and blink pivots through `avatarParts`. its body, finish and outfit remain editable. a regression compares the four eye parts against todd at three pointer positions in both directions of each named motion. the recorded builder comparisons above use `dotAvatar`, which reproduces the distinct eyes of the original dots builder.

in the profile review, alfred’s outer rim also projects past the cheek in the live reference. the comparison shows the frame, bow and eyelid as the face turns. each close-up is centred and scaled independently so the fittings can be inspected. differences in the surface of the fur remain visible, particularly on the yellow and lime heads. [live and blot close-ups](dot-review/activity-motion-review.webp)

a rerender of all 288 registered cases exposed a misplaced crown on cleo. its fitting had inherited another preset’s cap coefficients. restoring cleo’s measured crown reduced her whole-image mean channel error from 52.06 to 0.89. a regression now measures the centres and sizes of all 77 fitted catalog extras against their own reference sections. the held-out side views also confirmed that the raised edges of oval eyes should remain visible beyond the cheek. [cleo before and after](dot-review/cleo-crown-review.webp)

thelma’s left sunglass lens was missing its broad reflection and iggy’s ear cups showed ridges. the updated surface normals follow the lens and cup geometry as the head turns. thelma’s lenses also use the measured position of the studio light. across the 12,185 labelled sunglass pixels, average premultiplied channel error decreased from 6.10 to 3.03. iggy’s whole-image error in the held-out turn went from 6.43 to 6.34. [sunglass close-up](dot-review/lens-review.webp)

a separate pass reproduced cleo’s oversized crown in the saved picker sheet. her stage already had the repaired fit, while the sheet still showed the crown across her face. the refreshed sheet matches the current renderer on all 129 tiles. the browser also checks the crown and exposed face on cleo, esti and cosmo after selection. [catalog and stage close-ups](dot-review/preset-picker-review.webp)

iggy’s closed eyelids lost the curved reflection along their lower edges. the revised inserts use the observed closed-lid surfaces and local light direction. average channel error on the two labelled eye regions fell from 7.92 and 6.65 to 5.83 and 4.76 respectively. preserving more short-fibre detail on the ten furry portrait rigs also improved their frontal renders. after both changes, iggy’s whole-character error fell from 6.08 to 5.83 in front and from 6.34 to 6.03 in the held-out turn. the differences in the fur and the lid highlights are still visible at this magnification. [eyelid close-ups](dot-review/iggy-lid-review.webp)

on matte presets, the port missed the contact shadow under glasses and hat brims. the shell now samples the depth of the current outfit and its own surface. combined with the eye and fur changes, all 108 named portraits improved in mean channel error versus the preceding build. the catalog median including the builder control fell from 1.28 to 0.87. margot’s labelled shell error fell from 3.01 to 1.00 and watt’s from 2.87 to 0.96. in the held-out turns, whole-character error fell from 2.17 to 1.70 for tavi and from 1.92 to 1.24 for nomi. [hat and frame shadows](dot-review/matte-contact-review.webp)

a second close-up of margot revealed horizontal bands across her oval pupils. the same depth interpolation affected 62 eye surfaces on 31 presets. smooth fits to their observed front and back surfaces reduced mean error across the paired eye regions on every affected preset. the average of those 31 region scores fell from 1.40 to 0.77 after the shadow correction. [margot’s eye at 3×](dot-review/catalog-oval-review.webp)

the framing test samples each of the 54 motions at 64 times, then renders the extreme poses for eight wearers at normal strength and mirrored double strength. across 1,984 rendered frames, the earlier build clipped 274 frames in 36 motions. the revised bounds cleared every frame, including barrel roll. in 501 finish combinations, full ultracode preserved all 290,585 sampled interior fitting pixels. [browser regression](../scripts/wardrobe-power-page.ts)

the oval frames and monocle changed thickness when mounted on differently sized eyes. preserving the rim gauge decreased whole-avatar channel error in all seven affected frontal comparisons and all seven independently rendered turns. the unmodified triangle donor is the control. the capsule’s monocle still has a visible edge discrepancy, with 8.14/255 channel error on the labelled rim. [frame close-up](dot-review/fitted-oval-rims.webp)

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

The comparer returns exit status 1 while any case falls below the gate. It writes each case to `components/` under its report directory. With component masks, it also writes `section-metrics.csv` and a browsable `sections.html` gallery. The default command launches headless Chromium. For the recorded hardware scores, set `CHROMIUM_ANGLE=gl` to select hardware OpenGL. The graphics backend affects exact-byte comparisons. [Capture cases](../scripts/dot-cases.mjs) · [Capture entry point](../scripts/dot-capture-page.ts) · [Comparison code](../scripts/dot-compare.py)
