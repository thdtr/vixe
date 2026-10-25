// Grid and physics constants. Distances are in virtual pixels unless noted.

export const CW = 10;                 // cell width
export const CH = 18;                 // cell height
export const COLS = 64;
export const ROWS = 20;               // HUD row + 18 map rows + message row
export const MAP_COLS = 64;
export const MAP_ROWS = 18;
export const VIEW_W = COLS * CW;      // 640
export const VIEW_H = ROWS * CH;      // 360
export const MAP_Y = CH;              // the map is drawn one row below the HUD
export const MAP_W = MAP_COLS * CW;
export const MAP_H = MAP_ROWS * CH;

export const STEP = 1 / 120;          // fixed simulation step

export const PHYS = {
  w: 8, h: 15,                        // player hitbox
  run: 100,
  accel: 1400,
  friction: 1900,
  airAccel: 1000,
  airDrag: 260,                       // no input in the air: momentum fades slowly
  gravity: 1500,
  apexGravity: 0.6,                   // gravity scale near the top of a held jump
  maxFall: 520,
  jump: 420,
  jumpCut: 150,                       // upward speed cap after releasing jump
  coyote: 0.09,
  buffer: 0.12,
  bodyGravity: 1100,                  // falling scenery is a bit lazier than you
  bodyMaxFall: 600,
  driftAccel: 900,                    // how fast a field's push takes hold of you
};

const FACE = "'DejaVu Sans Mono','Cascadia Mono','Noto Sans Mono',Menlo,Consolas,'Liberation Mono',monospace";
export const FONT = `16px ${FACE}`;
export const FONT_BOLD = `bold 16px ${FACE}`;

export const SAVE_KEY = 'vixe/save/v1';
export const VERSION = '1.1.0';
