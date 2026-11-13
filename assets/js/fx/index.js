// The core effects library: every world can use these, and packs add their own on top.
// Imported once by main.js for its side effect.

import { registerFx } from '../game/fx.js';
import { light } from './light.js';
import { texture } from './texture.js';
import { dust, vignette } from './ambient.js';
import { cellar } from './cellar.js';
import { foundry } from './foundry.js';
import { mirror } from './mirror.js';
import { paper } from './paper.js';
import { stage } from './stage.js';
import { cosmos } from './cosmos.js';

registerFx('light', light);
registerFx('texture', texture);
registerFx('dust', dust);
registerFx('vignette', vignette);
registerFx('cellar', cellar);
registerFx('foundry', foundry);
registerFx('mirror', mirror);
registerFx('paper', paper);
registerFx('stage', stage);
registerFx('cosmos', cosmos);
