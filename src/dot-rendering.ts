import { extraRadiance } from './coat/dot-extra-radiance';
import { DOT_COLOURS, DOT_EXTRA_COLOURS } from './palette';
import { dotMesh } from './engine/dot-mesh';
import { dotFeatures } from './engine/dot-features';
import { dotAttachments } from './engine/dot-attachments';
import { catalogRigs } from './engine/dot-catalog-surfaces';
import { catalogLight } from './coat/dot-catalog-light';
import { groomBodies, groomFields, groomWidth, groomHeight, groomResponse } from './coat/dot-groom';
import { portraitGrooms, portraitGroomSize } from './coat/dot-portrait-groom';
import { portraitParts, portraitMaterials } from './coat/dot-portrait-materials';
import { portraitLight } from './coat/dot-portrait-light';

/** dotAvatar installs these fitted surfaces and finishes before the first Dot is mounted. */
export const dotRendering = {
  dotMesh, dotFeatures, dotAttachments, catalogRigs, catalogLight, extraRadiance,
  extraSwatches: [...DOT_COLOURS, ...DOT_EXTRA_COLOURS.slice(-2)].map(([hex]) => parseInt(hex.slice(1), 16)),
  groomBodies, groomFields, groomWidth, groomHeight, groomResponse,
  portraitGrooms, portraitGroomSize, portraitParts, portraitMaterials, portraitLight,
};
