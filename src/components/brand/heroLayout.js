// Shared geometry for the hero: the HTML resume pages (positioned with CSS 3D
// transforms) and the WebGL layer on top of them use these same numbers, so
// the check mark, file tiles and shadows line up with the pages exactly.
//
// World units: a page is 3 units wide. On screen a page is 30em wide, so one
// unit is always 10em and the pages are sized in em. The hero sets the em size
// from the stage, which keeps each page close to 1:1 with screen pixels:
// browsers then draw the resume text natively, sharp at any size.

export const PAGE_WIDTH = 3;
export const PAGE_RATIO = Math.SQRT2;
export const PAGE_HEIGHT = PAGE_WIDTH * PAGE_RATIO;
export const EM_PER_UNIT = 10;
export const PAGE_EMS = { width: PAGE_WIDTH * EM_PER_UNIT, height: PAGE_HEIGHT * EM_PER_UNIT };
export const CAMERA_DISTANCE = 18;

/** The stack's resting angle, in radians (three.js XYZ order). */
export const STACK_ROTATION = [-0.04, -0.2, 0.012];

/** Back to front, which is also their paint order. */
export const HERO_PAGES = [
  { id: 'back', rest: [1.02, 0.76, -0.9], tilt: -0.1 },
  { id: 'middle', rest: [0.52, 0.24, -0.45], tilt: -0.05 },
  { id: 'front', rest: [0, -0.36, 0], tilt: 0 },
];

/** Pixel size of 1em on the pages for a stage of this size. */
export const pageEm = (stageWidth, stageHeight) => {
  const fitWidth = stageWidth < 520 ? 0.74 : 0.6;
  return Math.max(4, Math.min((fitWidth * stageWidth) / PAGE_EMS.width, (0.7 * stageHeight) / PAGE_EMS.height));
};

const fixed = (value) => Number(value.toFixed(5));

/**
 * The CSS transform of a page at rest. three.js is y-up and CSS is y-down, so
 * rotations about x and z flip sign and y translations invert.
 */
export const restingTransform = (page) => {
  const [sx, sy, sz] = STACK_ROTATION;
  const [x, y, z] = page.rest.map((value) => fixed(value * EM_PER_UNIT));
  return `rotateX(${fixed(-sx)}rad) rotateY(${fixed(sy)}rad) rotateZ(${fixed(-sz)}rad) translate3d(${x}em, ${-y}em, ${z}em) rotateZ(${fixed(-page.tilt)}rad)`;
};
