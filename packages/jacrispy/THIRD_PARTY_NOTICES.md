# Third-party notices

This package is MIT-licensed (see `LICENSE`). It is drawn by `@blot/avatar`, which has its own licence and notices.

## Reachy Mini (Pollen Robotics)

The `jacrispy` body (`src/jacrispy.ts`) is shaped after the Reachy Mini robot by Pollen Robotics. Its proportions (the head's width, height and depth, the sizes of the two lenses and their rims, the bar between them and its camera, where the antennas sit and the length of their springs, and the colours of those parts) were measured from the Reachy Mini's published model. Only the head is drawn. No geometry, mesh, image or other file from that model is in this package; the body is spheres written by hand. Pollen Robotics publishes the Reachy Mini's software under Apache 2.0 and its hardware design files under CC BY-NC-SA 4.0. Reachy and Reachy Mini are names of Pollen Robotics. This package is not affiliated with or endorsed by Pollen Robotics.

The timing and size of jacrispy's mood moves (`JACRISPY_CLIPS`, see `JACRISPY_MOODS`) were measured from recordings in Pollen Robotics' Reachy Mini emotions library (`pollen-robotics/reachy-mini-emotions-library` on Hugging Face, Apache 2.0): how far and how fast the head turns, tilts and bobs and the antennas swing in each. The moves are written by hand as curves; no recording or other file from that library is in this package.

Pollen Robotics' Reachy Mini sticker generator and the jacrispy station's app icon were looked at for the look of the face only. Nothing from either is in this package.
