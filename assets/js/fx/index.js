// The core effects library: every world can use these, and packs add their own on top.
// Imported once by main.js for its side effect.

import { registerFx } from '../game/fx.js';
import { light } from './light.js';
import { texture } from './texture.js';

registerFx('light', light);
registerFx('texture', texture);
