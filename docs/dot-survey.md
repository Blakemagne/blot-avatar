# Dot avatar customization survey

The reference was the signed-in web character editor on November 25, 2026. It has eight starter characters, a character builder and a separately labeled pet picker. The branch implements the geometric character builder in blot’s renderer. The studio opens with the observed cyan triangle, sleepy eyes, yellow crown and fur.

## What the port adds to blot

| Area | Before this branch | Added here |
|---|---|---|
| Bodies | Blob, wedge, tablet, heart, clover, flower and hex cover related forms. The library also accepts arbitrary inflated outlines. | Eleven separately addressable measured silhouettes, including both ear arrangements and the asymmetric blossom. Existing blot shapes keep their IDs. |
| Colour and finish | Eleven blot swatches, arbitrary CSS fills, a WebGL fur coat and the animated Ultracode skin. | The sampled body and extra palettes, an independent extra tint and a selectable glossy finish. Fur uses the existing coat renderer. |
| Face | Expressions reshape and animate the eyes. Decals can sit on the face. | Eight persistent eye designs with their own glints and lids, the raised-eye exception, and independently selected lens geometry. |
| Extras | Bodies can carry custom decals and spring antennas. | Eight selectable modeled extras, fitted to the chosen body's bounds and projected with its rotation. |
| Motion | Blot already blinks, tracks a pointer, eases its pose and supports reduced motion. | The Dot studio reuses the rig and limits pointer travel. Editing an accessory on the same body preserves the pose. |
| Presets | Blot bodies and a gallery of outline definitions. | Eight named Dot character recipes and a studio for editing their individual components. |

## Body geometry

![All eleven reconstructed bodies, each facing forward and turned 35 degrees](dot-geometry.png)

Each picker tile contains a silhouette with its own aspect ratio and transparent margin. The measurements below use occupied pixels at half opacity in the native image. Each fitted contour is centered on its bounds and scaled uniformly to 80 units. Blot inflates the contour with its existing sphere-hull engine. Face placement uses the oval-eye thumbnails in the reference, with a separate raised-eye treatment for Todd.

Overlap is intersection area divided by union area, measured at native resolution. The first score compares the fitted 2D path with the reference. The second compares the actual front-facing solid rendered by blot at 200 px with the same reference. Depth, back geometry and shading require separate comparisons.

| Shape | Occupied W × H | Geometry visible in the picker | Path overlap | Rendered overlap |
|---|---:|---|---:|---:|
| Blossie | 162 × 162 | Unequal soft lobes around a nearly square envelope, with off-center top and bottom lobes | 99.65% | 98.87% |
| Circle | 161 × 161 | Continuous circular perimeter | 99.69% | 99.02% |
| Rounded triangle | 162 × 148 | Broad level base, rounded lower corners and a short rounded apex | 99.90% | 99.54% |
| Capsule | 162 × 111 | Horizontal oval-ended body, about 1.46 times as wide as tall | 99.86% | 97.43% |
| Rounded head with two ears | 162 × 135 | Broad cheeks with paired protrusions above the head. Todd places the white eye sockets on these protrusions | 99.64% | 98.81% |
| Heart | 136 × 126 | Two upper lobes, a central notch and a rounded lower point | 99.71% | 99.10% |
| Four lobed butterfly | 148 × 113 | Four broad wings, with recesses at the top, bottom and sides | 99.59% | 98.98% |
| Circle with two ears | 121 × 158 | Tall asymmetric silhouette. Two short, overlapping projections rise from the upper half. The eye line sits below the box center | 99.66% | 98.91% |
| Twelve scalloped rosette | 161 × 161 | Twelve shallow scallops around a round disc | 99.68% | 98.96% |
| Hexagon | 161 × 162 | Six unequal projected sides, soft corners and a tilted top edge | 99.89% | 99.38% |
| Rounded diamond | 162 × 162 | Four diagonal flanks with broad rounded tips | 99.96% | 99.41% |

The stored reference consists of horizontal occupied spans, one row per native image row. The test fills the fitted path and projected body at those same pixel centers. This catches a stretched capsule, misplaced lobes or filled-in ear notches even when the outer width and height agree.

## Colour and material

| Body colour | sRGB | Body colour | sRGB |
|---|---|---|---|
| White | `#FFFFFF` | Cyan | `#00B1FF` |
| Pink | `#FA70AB` | Teal | `#04BB9F` |
| Orchid | `#DD6ADC` | Lime | `#B6D80B` |
| Violet | `#A25BFF` | Yellow | `#FFCC38` |
| Blue | `#4778FF` | Coral | `#FF8066` |

Each of the eight extras exposed its own palette. In display order it runs from Pink through Coral, then White, Charcoal (`#1F1F1F`) and Brown (`#8C4A2B`). Selecting None removes the extra colour control. Glasses have a style selector. The editor offers Glossy and Fur. Glossy shows a smooth body highlight and darker edge. Fur breaks up the surface with a fine pile. The port uses SVG shading for gloss and blot’s existing WebGL2 coat for fur. Lighting coefficients, fiber density and fiber length have not been matched numerically.

## Face and wardrobe

| Control | Observed designs and distinguishing details |
|---|---|
| Eyes | Swept lids extend sideways. Oval is a plain upright pair. Sparkle capsules have bright star-shaped insets. Highlight capsules have small round glints. Dots are small and circular. Round highlights pair a round eye with a bright inset. Crescent inset has a curved internal mark. Sleepy lids have a wide horizontal lid over a short pupil. |
| Shape-dependent eyes | Selecting Rounded head with two ears removes the Eyes tab. Its preset shows dark pupils in pale raised sockets. Circle with two ears keeps all eight eye choices. |
| Glasses | None, a single monocle with a trailing chain, two tall open oval rims, two separate trapezoid lenses, classic sunglasses with a heavy brow, and round sunglasses with a bridge. |
| Extras | None, headphones arching over the head with side pads, bow tie at the lower edge, close-fitting beanie, brimmed hat, asymmetrical beret, round bulb above the head, a small offset tuft, and a pointed crown with a band and tip beads. |

## Starter characters

| Character | Shape and finish | Eyes | Glasses | Extra |
|---|---|---|---|---|
| Blossie | White Blossie, glossy | Oval | None | None |
| Alfred | Yellow rounded triangle, fur | Sleepy lids | Tall oval frames | Bow tie |
| Jojo | Orchid heart, fur | Oval | Round sunglasses | None |
| Iris | Coral rosette, fur | Round highlights | Monocle | None |
| Todd | Lime rounded head with two ears, fur | Fixed raised eyes | None | Bow tie |
| Iggy | Pink circle with two ears, fur | Swept lids | None | Headphones |
| Felipe | Blue hexagon, fur | Oval | None | Beret |
| Thelma | Golden rounded diamond, fur | Oval | Classic sunglasses | Bulb |

Thelma’s body swatch showed no selected standard colour. The preset uses the nearest standard yellow in this port. Preset accessory colours are visual matches. The separate pet picker offered Create a pet, Codex, Dewey, Fireball, Hoots, Rocky, Seedy, Stacky, BSOD and Null Signal. These entries use a separate creation flow. They remain outside the implemented character catalog.

## Motion and remaining fidelity work

In the live editor the crown and glasses kept their position as the eyes blinked. The sparkle eyes closed briefly into horizontal marks. The idle body remained near center. Hover samples on either side, above, below and outside the avatar showed too little directional change to infer an exact cursor response or easing curve. The studio uses blot’s blink and a restrained version of its pointer-follow rig. The selected follow strength is an implementation choice.

The front-contour scores apply to the shape picker. Individual eye designs, accessory solids, depth and surface finishes are reconstructions. Their rendered pixels have not been scored across yaw, pitch, occlusion, blinking and lighting. During blot-specific loading figures and shape transitions the engine uses its standard transition face.
