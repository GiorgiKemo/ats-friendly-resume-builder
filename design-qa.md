# Homepage 3D scenes

The homepage's 3D is rendered live with three.js. It uses no character models, videos or pre-rendered images: every mesh, texture and light is built in code. The previous paper companion and the Blender character clips were removed. Their visual approval was blocked.

## Scenes

| Section | What it shows | Code |
| --- | --- | --- |
| Hero | A stack of resume pages deals in under studio light. The front page "prints", a light scans it and highlights keywords, then a glass check badge and PDF/DOCX tiles pop out. The canvas fills the hero, with an aurora and grid backdrop; the composition is framed on the right-hand stage. Drag turns the stack; click (or Enter) replays the scan. | `src/components/three/heroScene.js`, `src/components/brand/HeroScene.jsx` |
| "That feeling when you hit send" | The example resume folds itself into a dart, crease by crease, launches into a loop with contrails and confetti, then glides on a figure-eight. "Celebrate again" plays another loop. | `src/components/three/planeScenes.js` (`createSendScene`) |
| CTA | The paper plane hovers, banks towards the cursor and rolls now and then. | `planeScenes.js` (`createCtaScene`) |

Shared pieces:
- `runtime.js`: renderer lifecycle (pauses off screen and in hidden tabs, follows the theme, drops resolution on slow devices, handles context loss) and a procedural studio environment.
- `resumeArt.js`: Canvas 2D artwork for the pages.
- `paperPlane.js`: folding mesh, contrail ribbons and confetti.
- `src/utils/paperFold.js` and `src/utils/sceneMotion.js`: pure math, covered by `tests/sceneMotion.test.js`.

## Behaviour

- **Reduced motion:** each scene renders one settled frame: the finished stack, or the plane in flight with its contrails. There is no intro, idle motion, pointer tilt or confetti, and the setting updates live.
- **No WebGL / context loss:** the hero shows a flat CSS/Canvas page stack, and the plane scenes show an SVG paper plane.
- **Loading:** three.js loads after first paint for the hero, and when the plane sections come within 300px of the viewport. Nothing renders while a scene is off screen.
- **Accessibility:** canvases are `aria-hidden`. The hero stage is a labelled button with a visible hint, and replays announce that the scan is a demonstration, not an assessment.

## Checked

Light and dark themes; 1440×900 at 1x and 2x; 390×844 touch; reduced motion; intro and flight sequences frame by frame.
