import { readyIdle } from './engine/dot-motion';
import { createDotContact } from './coat/dot-contact';
import { contactColor } from './coat/dot-contact-color';
import { mattePartLayers, mattePartRadiance } from './coat/dot-part-radiance';
import { matteBodyLayers, matteBodyRadiance } from './coat/dot-matte-radiance';
import { catalogCrownLayers } from './coat/dot-catalog-crown-light';
import { extraRadiance } from './coat/dot-extra-radiance';
import { DOT_COLOURS, DOT_EXTRA_COLOURS } from './palette';
import { dotMesh } from './engine/dot-mesh';
import { dotFeatures } from './engine/dot-features';
import { dotAttachments } from './engine/dot-attachments';
import { catalogRigs } from './engine/dot-catalog-surfaces';
import { catalogLight } from './coat/dot-catalog-light';
import { feltShadow } from './coat/dot-felt-shadow';
import { feltLayers, feltRadiance } from './coat/dot-felt-radiance';
import { furRadiance, groomResponse } from './coat/dot-fur-radiance';
import { groomBodies, groomFields, groomSize } from './coat/dot-groom';
import { portraitGrooms, portraitGroomSize } from './coat/dot-portrait-groom';
import { portraitParts, portraitMaterials } from './coat/dot-portrait-materials';
import { portraitLight } from './coat/dot-portrait-light';

function groomField(index: number): Uint8Array {
  const packed = atob(groomFields[index]);
  const field = new Uint8Array(4*groomSize*groomSize).fill(128);
  let cursor = 0;
  const word = () => packed.charCodeAt(cursor++) | (packed.charCodeAt(cursor++) << 8);
  for (let row = 0; row < 2*groomSize; row++) {
    const start = word(), count = word();
    let offset = 2*(row*groomSize + start);
    for (let i = 0; i < count; i++) {
      const pair = packed.charCodeAt(cursor++);
      field[offset++] = 128 + 15*((pair >> 4)-8);
      field[offset++] = 128 + 15*((pair & 15)-8);
    }
  }
  return field;
}

/** dotAvatar installs these fitted surfaces and finishes before the first Dot is mounted. */
export const dotRendering = {
  readyIdle, createDotContact, contactColor, dotMesh, dotFeatures, dotAttachments, catalogRigs, catalogLight,
  matteBodyLayers, mattePartLayers,
  extraRadiance: { matte: { ...extraRadiance.matte, layers: [...extraRadiance.matte.layers, ...matteBodyRadiance, ...mattePartRadiance] }, polished: { ...extraRadiance.polished, layers: [...extraRadiance.polished.layers, ...catalogCrownLayers] } },
  extraSwatches: [...DOT_COLOURS, ...DOT_EXTRA_COLOURS.slice(-2)].map(([hex]) => parseInt(hex.slice(1), 16)),
  groomBodies, groomField, groomSize, groomResponse, feltLayers, feltShadow,
  feltExtent: { 'Felipe flower': [.09,.86], Josh: [.15,.67], Alfred: [.11,.90], Blossie: [-.01,.89],
    Iris: [.11,.91], Thelma: [.08,.87], Todd: [.16,.89], Iggy: [.15,.64], Jojo: [.12,.89], Felipe: [.14,.67] } as Readonly<Record<string, readonly number[]>>,
  furRadiance: { ...furRadiance, layers: [...furRadiance.layers, ...feltRadiance] },
  portraitGrooms, portraitGroomSize, portraitParts, portraitMaterials, portraitLight,
};
