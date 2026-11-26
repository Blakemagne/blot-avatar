import { fibreDyes } from './coat/dot-fibre-dyes';
import { fibreSubstrates } from './coat/dot-fibre-substrate';
import { createDotFibres } from './coat/dot-fibres';
import { insetEyeRadiance } from './coat/dot-inset-radiance';
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
import { builderFittings } from './engine/dot-builder-fittings';
import { fittedMesh } from './engine/dot-fitted-mesh';
import { dotAttachments } from './engine/dot-attachments';
import { catalogRigs } from './engine/dot-catalog-surfaces';
import { catalogLight } from './coat/dot-catalog-light';
import { feltShadow } from './coat/dot-felt-shadow';
import { feltLayers, feltRadiance } from './coat/dot-felt-radiance';
import { furRadiance } from './coat/dot-fur-radiance';
import { builderGain, builderReliefs } from './coat/dot-builder-relief';
import { feltField } from './coat/dot-felt-field';
import { feltReliefs, feltSize } from './coat/dot-felt-relief';
import { portraitParts, portraitMaterials } from './coat/dot-portrait-materials';
import { portraitLight } from './coat/dot-portrait-light';

/** dotAvatar installs these fitted surfaces and finishes before the first Dot is mounted. */
export const dotRendering = {
  readyIdle, createDotContact, createDotFibres, fibreSubstrates, fibreDyes, contactColor, dotMesh, dotFeatures, dotAttachments, builderFittings, fittedMesh, catalogRigs, catalogLight,
  matteBodyLayers, mattePartLayers,
  insetLayer: extraRadiance.matte.layers.length + matteBodyRadiance.length + mattePartRadiance.length,
  extraRadiance: { matte: { ...extraRadiance.matte, layers: [...extraRadiance.matte.layers, ...matteBodyRadiance, ...mattePartRadiance, ...insetEyeRadiance] }, polished: { ...extraRadiance.polished, layers: [...extraRadiance.polished.layers, ...catalogCrownLayers] } },
  extraSwatches: [...DOT_COLOURS, ...DOT_EXTRA_COLOURS.slice(-2)].map(([hex]) => parseInt(hex.slice(1), 16)),
  builderGain, builderReliefs, feltLayers, feltShadow,
  feltExtent: { 'Felipe flower': [.09,.86], Josh: [.15,.67], Alfred: [.11,.90], Blossie: [-.01,.89],
    Iris: [.11,.91], Thelma: [.08,.87], Todd: [.16,.89], Iggy: [.15,.64], Jojo: [.12,.89], Felipe: [.14,.67] } as Readonly<Record<string, readonly number[]>>,
  furRadiance: { ...furRadiance, layers: [...furRadiance.layers, ...feltRadiance] },
  feltReliefs, feltSize, feltField, portraitParts, portraitMaterials, portraitLight,
};
