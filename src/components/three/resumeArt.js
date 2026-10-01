// Canvas artwork for the WebGL scenes. The paper plane folds the same example
// resume the hero shows as HTML (src/components/brand/HeroPages.jsx), so this
// draws that page with the same font, sizes and spacing, measured in "em"
// where the page is 30em wide, exactly as the CSS does.

const FAMILY = "'ResumeInter', 'ResumeSans', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const PAGE_EMS = 30;
const PAGE_RATIO = Math.SQRT2;
const COLORS = { ink: '#0f172a', body: '#1e293b', muted: '#475569', accent: '#1d4ed8', rule: '#cbd5e1', separator: '#94a3b8' };

/** Waits for the resume font (bundled with the app) so canvas text uses it. */
export function loadResumeFonts() {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve();
  return Promise.all(['400', '700'].map((weight) => document.fonts.load(`${weight} 32px ResumeInter`))).catch(() => {});
}

function writer(context, em) {
  const font = (size, weight = 400) => `${weight} ${size * em}px ${FAMILY}`;
  const state = { baseline: 0 };
  /** Draws one line of text whose line box starts at `top` (in px). */
  const line = (text, { x, top, size, weight = 400, height = 1.4, color = COLORS.body, align = 'left', tracking = 0 }) => {
    context.font = font(size, weight);
    context.letterSpacing = `${tracking * size * em}px`;
    context.fillStyle = color;
    context.textAlign = align;
    const metrics = context.measureText(text || 'M');
    const ascent = metrics.fontBoundingBoxAscent ?? size * em * 0.97;
    const descent = metrics.fontBoundingBoxDescent ?? size * em * 0.24;
    const box = size * em * height;
    state.baseline = top + (box - ascent - descent) / 2 + ascent;
    context.fillText(text, x, state.baseline);
    context.letterSpacing = '0px';
    return top + box;
  };
  /** Wraps `text` within `width` (px); returns the bottom of the last line. */
  const wrap = (text, { x, top, width, size, height = 1.5, color = COLORS.body, weight = 400 }) => {
    context.font = font(size, weight);
    const words = text.split(' ');
    let current = '';
    let y = top;
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && context.measureText(candidate).width > width) {
        y = line(current, { x, top: y, size, height, color, weight });
        current = word;
      } else {
        current = candidate;
      }
    }
    return current ? line(current, { x, top: y, size, height, color, weight }) : y;
  };
  return { font, line, wrap, state };
}

/**
 * The example resume (Clarity design) as a canvas `width` pixels wide.
 * Mirrors .hero-doc in src/styles/home-hero.css.
 */
export function drawExampleResume(width = 1280) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width * PAGE_RATIO);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const em = width / PAGE_EMS;
  const { line, wrap, state } = writer(context, em);
  const left = 2.5 * em;
  const right = width - 2.5 * em;
  const contentWidth = right - left;
  let y = 2.4 * em;

  y = line('Alex Morgan', { x: left, top: y, size: 2.35, weight: 700, height: 1.12, color: COLORS.ink, tracking: -0.015 });
  y = line('Product Designer', { x: left, top: y + 0.3 * 1.08 * em, size: 1.08, height: 1.35, color: COLORS.accent });
  y += 0.45 * 0.78 * em;
  const contacts = ['alex@example.com', 'Remote', 'alexmorgan.design'];
  let x = left;
  context.font = `400 ${0.78 * em}px ${FAMILY}`;
  contacts.forEach((item, index) => {
    if (index) {
      const gap = context.measureText(' • ').width + 0.3 * 0.78 * em;
      line('•', { x: x + gap / 2, top: y, size: 0.78, color: COLORS.separator, align: 'center' });
      x += gap;
    }
    line(item, { x, top: y, size: 0.78, color: COLORS.muted });
    context.font = `400 ${0.78 * em}px ${FAMILY}`;
    x += context.measureText(item).width;
  });
  y += 0.78 * 1.4 * em + 1.5 * em;

  const heading = (label, first = false) => {
    if (!first) y += 1.1 * em;
    y = line(label.toUpperCase(), { x: left, top: y, size: 0.74, weight: 700, height: 1.2, color: COLORS.ink, tracking: 0.08 });
    y += 0.42 * 0.74 * em;
    context.fillStyle = COLORS.rule;
    context.fillRect(left, y, contentWidth, Math.max(1, 0.07 * em));
    y += Math.max(1, 0.07 * em) + 0.62 * 0.74 * em;
  };
  const entry = (title, dates, org, bullets = [], first = true) => {
    if (!first) y += 0.75 * em;
    const top = y;
    y = line(title, { x: left, top, size: 0.9, weight: 700, height: 1.35, color: COLORS.ink });
    // Dates share the title's baseline, as in the flex row.
    context.font = `400 ${0.76 * em}px ${FAMILY}`;
    context.fillStyle = COLORS.muted;
    context.textAlign = 'right';
    context.fillText(dates, right, state.baseline);
    y = line(org, { x: left, top: y + 0.12 * 0.8 * em, size: 0.8, height: 1.4, color: COLORS.accent });
    if (bullets.length) y += 0.35 * em;
    bullets.forEach((bullet, index) => {
      if (index) y += 0.2 * 0.84 * em;
      context.fillStyle = COLORS.accent;
      context.beginPath();
      context.arc(left + (0.2 + 0.16) * 0.84 * em, y + (0.62 + 0.16) * 0.84 * em, 0.16 * 0.84 * em, 0, Math.PI * 2);
      context.fill();
      y = wrap(bullet, { x: left + 1.05 * 0.84 * em, top: y, width: contentWidth - 1.05 * 0.84 * em, size: 0.84 });
    });
  };

  heading('Professional Summary', true);
  y = wrap('Product designer who pairs user research with fast iteration to ship clear, accessible experiences.', { x: left, top: y, width: contentWidth, size: 0.86 });
  heading('Core Competencies');
  y = wrap('User research  •  Figma  •  Accessibility  •  Prototyping  •  Design systems', { x: left, top: y, width: contentWidth, size: 0.86 });
  heading('Professional Experience');
  entry('Senior Product Designer', 'Jan 2022 – Present', 'Northstar · Remote', [
    'Led the onboarding redesign from research to launch, lifting activation by 28%.',
    'Built an accessible component library with engineering.',
  ]);
  entry('Product Designer', 'Jun 2019 – Dec 2021', 'Brightline · Austin, TX', ['Ran weekly usability sessions and Figma prototype tests.'], false);
  heading('Education');
  entry('B.A. Design', '2015 – 2019', 'State University');
  heading('Certifications & Licenses');
  entry('Accessibility Specialist', '2023', 'IAAP');
  return { canvas };
}

/** Label art for the floating file tiles ("PDF", "DOCX"). */
export function drawTileLabel(label, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const s = size / 256;
  context.scale(s, s);
  context.fillStyle = '#ffffff';
  context.strokeStyle = '#ffffff';
  context.lineWidth = 9;
  context.lineJoin = 'round';
  // Document glyph with a folded corner.
  context.beginPath();
  context.moveTo(92, 44);
  context.lineTo(146, 44);
  context.lineTo(170, 68);
  context.lineTo(170, 134);
  context.lineTo(92, 134);
  context.closePath();
  context.stroke();
  context.beginPath();
  context.moveTo(144, 46);
  context.lineTo(144, 70);
  context.lineTo(168, 70);
  context.stroke();
  context.fillRect(108, 92, 44, 8);
  context.fillRect(108, 110, 30, 8);
  context.textAlign = 'center';
  context.font = `700 ${label.length > 3 ? 50 : 60}px ${FAMILY}`;
  context.fillText(label, 131, 206);
  return canvas;
}
