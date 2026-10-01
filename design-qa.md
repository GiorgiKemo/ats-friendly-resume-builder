# Homepage 3D scenes

The homepage's 3D is rendered live with three.js. It uses no character models, videos or pre-rendered images: every mesh, texture and light is built in code. The previous paper companion and the Blender character clips were removed. Their visual approval was blocked.

## Scenes

| Section | What it shows | Code |
| --- | --- | --- |
| Hero | Three resume pages (the product's Clarity, Horizon and Heritage designs) fanned in 3D. The front page prints, a light scans it and highlights keywords, then a solid green check mark and glossy PDF/DOCX tiles pop out. Drag turns the stack; click (or Enter) replays the scan. | `src/components/brand/HeroPages.jsx` (pages), `src/components/three/heroScene.js` (motion and WebGL layer), `src/components/brand/HeroScene.jsx` |
| "That feeling when you hit send" | The example resume folds itself into a dart, crease by crease, launches into a loop with contrails and confetti, then glides on a figure-eight. "Celebrate again" plays another loop. | `src/components/three/planeScenes.js` (`createSendScene`) |
| CTA | The paper plane hovers, banks towards the cursor and rolls now and then. | `planeScenes.js` (`createCtaScene`) |

**Why the hero pages are HTML.** Text drawn into a WebGL texture is resampled by the GPU and loses contrast, so the resume text looked soft. The hero pages are real HTML instead, placed in 3D with CSS `matrix3d` transforms computed from the same three.js objects as the WebGL layer. The browser then draws the text natively, so it is sharp at any pixel density. The pages are sized in em so they render at about 1:1 with screen pixels. The page container must stay `transform-style: flat`: inside a `preserve-3d` context Chrome rasterizes text at low resolution and it blurs on 2x/3x screens. A transparent WebGL canvas on top holds the check mark, tiles, sparkle and light motes. Invisible stand-in planes for the pages give it correct depth and receive the tiles' shadows. The aurora behind everything is CSS. Shared geometry lives in `src/components/brand/heroLayout.js`.

The paper plane must physically fold, so its page stays a texture. `resumeArt.js` draws it from the same layout and font (Inter) as the HTML page, after the font has loaded, and the material samples it with a sharper mip bias.

Shared pieces:
- `runtime.js`: renderer lifecycle (pauses off screen and in hidden tabs, follows the theme, drops resolution on slow devices, handles context loss) and a procedural studio environment.
- `resumeArt.js`: Canvas 2D artwork for the paper plane's page and the file tiles.
- `paperPlane.js`: folding mesh, contrail ribbons and confetti.
- `src/utils/paperFold.js` and `src/utils/sceneMotion.js`: pure math, covered by `tests/sceneMotion.test.js`.

## Behaviour

- **Reduced motion:** each scene renders one settled frame: the finished stack with its keywords highlighted, or the plane in flight with its contrails. There is no intro, idle motion, pointer tilt or confetti, and the setting updates live.
- **No WebGL / context loss:** the hero keeps its HTML pages in their resting pose without the floating objects, and the plane scenes show an SVG paper plane.
- **Loading:** three.js loads after first paint for the hero, and when the plane sections come within 300px of the viewport. Nothing renders while a scene is off screen.
- **Accessibility:** canvases are `aria-hidden`. The hero stage is a labelled button with a visible hint, and replays announce that the scan is a demonstration, not an assessment.

## Checked

Light and dark themes; 1440×900 at 1x and 2x; 390×844 at 3x (text sharpness checked at native resolution); reduced motion; no WebGL; intro and flight sequences frame by frame.
