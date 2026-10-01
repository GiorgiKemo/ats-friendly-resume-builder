// Printed artwork for the 3D resume pages, drawn with Canvas 2D so it stays
// crisp at any size and needs no image downloads. The example resume also
// records where its keywords sit, so the scan can highlight them.

const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';
export const PAGE_RATIO = Math.SQRT2;

const INK = '#0f172a';
const BODY = '#334155';
const MUTED = '#55657a';

const KEYWORDS = new Set(['research', 'accessible', '28%', 'component', 'library', 'usability', 'Figma']);

function page(width) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.round(width * PAGE_RATIO);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textBaseline = 'alphabetic';
  return { canvas, context, scale: width / 1200 };
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

/** Wraps text into lines and records keyword boxes as it goes. */
function paragraph(context, text, x, y, maxWidth, lineHeight, marks) {
  const words = text.split(' ');
  const space = context.measureText(' ').width;
  let cursorX = x;
  let cursorY = y;
  for (const word of words) {
    const width = context.measureText(word).width;
    if (cursorX + width > x + maxWidth && cursorX > x) {
      cursorX = x;
      cursorY += lineHeight;
    }
    context.fillText(word, cursorX, cursorY);
    const bare = word.replace(/[.,]$/, '');
    if (marks && KEYWORDS.has(bare)) {
      const size = parseFloat(context.font.match(/(\d+(?:\.\d+)?)px/)[1]);
      marks.push({ x: cursorX - size * 0.18, y: cursorY - size * 0.95, w: context.measureText(bare).width + size * 0.36, h: size * 1.3 });
    }
    cursorX += width + space;
  }
  return cursorY + lineHeight;
}

/**
 * The example resume shown on the front page. Returns the canvas and the
 * keyword boxes (in canvas pixels) for the ATS scan highlights.
 */
export function drawExampleResume(width = 1200) {
  const { canvas, context, scale } = page(width);
  const marks = [];
  context.save();
  context.scale(scale, scale);
  const left = 96;
  const right = 1200 - 96;
  const contentWidth = right - left;

  context.fillStyle = INK;
  context.font = `800 100px ${FONT}`;
  context.letterSpacing = '-2px';
  context.fillText('Alex Morgan', left, 176);
  context.letterSpacing = '0px';
  context.fillStyle = '#2563eb';
  context.font = `700 42px ${FONT}`;
  context.fillText('Product Designer', left, 240);

  context.font = `500 27px ${FONT}`;
  context.fillStyle = MUTED;
  const contacts = ['alex@example.com', 'Remote', 'alexmorgan.design'];
  let contactX = left;
  contacts.forEach((item, index) => {
    if (index) {
      context.fillStyle = '#93c5fd';
      context.beginPath();
      context.arc(contactX + 15, 292, 5, 0, Math.PI * 2);
      context.fill();
      contactX += 30;
      context.fillStyle = MUTED;
    }
    context.fillText(item, contactX, 301);
    contactX += context.measureText(item).width + 4;
  });
  context.fillStyle = '#2563eb';
  context.fillRect(left, 340, contentWidth, 6);

  const heading = (label, y) => {
    context.fillStyle = '#2563eb';
    context.fillRect(left, y - 28, 8, 36);
    context.fillStyle = INK;
    context.font = `800 28px ${FONT}`;
    context.letterSpacing = '5px';
    context.fillText(label, left + 26, y);
    const end = left + 40 + context.measureText(label).width;
    context.letterSpacing = '0px';
    context.fillStyle = '#e2e8f0';
    context.fillRect(end, y - 11, right - end, 3);
    return y + 56;
  };

  let y = heading('SUMMARY', 428);
  context.font = `400 32px ${FONT}`;
  context.fillStyle = BODY;
  y = paragraph(context, 'Product designer who pairs user research with fast iteration to ship clear, accessible experiences.', left, y, contentWidth, 46, marks);

  y = heading('EXPERIENCE', y + 40);
  const role = (title, dates, company, bullets) => {
    context.fillStyle = INK;
    context.font = `700 35px ${FONT}`;
    context.fillText(title, left, y);
    context.font = `500 27px ${FONT}`;
    context.fillStyle = MUTED;
    context.fillText(dates, right - context.measureText(dates).width, y);
    y += 42;
    context.fillText(company, left, y);
    y += 50;
    context.font = `400 30px ${FONT}`;
    for (const bullet of bullets) {
      context.fillStyle = '#2563eb';
      context.beginPath();
      context.arc(left + 9, y - 10, 6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = BODY;
      y = paragraph(context, bullet, left + 36, y, contentWidth - 36, 43, marks) + 6;
    }
    y += 24;
  };
  role('Senior Product Designer', '2022 – Now', 'Northstar  ·  Remote', [
    'Led the onboarding redesign from research to launch, lifting activation by 28%.',
    'Built an accessible component library with engineering.',
  ]);
  role('Product Designer', '2019 – 2021', 'Brightline  ·  Austin, TX', [
    'Ran weekly usability sessions and Figma prototype tests.',
  ]);

  y = heading('EDUCATION', y + 16);
  context.fillStyle = INK;
  context.font = `700 34px ${FONT}`;
  context.fillText('B.A. Design', left, y);
  context.font = `500 27px ${FONT}`;
  context.fillStyle = MUTED;
  context.fillText('2015 – 2019', right - context.measureText('2015 – 2019').width, y);
  context.fillText('State University', left, y + 42);
  y += 128;

  y = heading('SKILLS', y);
  context.font = `600 28px ${FONT}`;
  let pillX = left;
  let pillY = y - 34;
  for (const skill of ['User research', 'Figma', 'Accessibility', 'Prototyping', 'Design systems']) {
    const pillWidth = context.measureText(skill).width + 46;
    if (pillX + pillWidth > right) {
      pillX = left;
      pillY += 70;
    }
    roundRect(context, pillX, pillY, pillWidth, 54, 27);
    context.fillStyle = '#eff6ff';
    context.fill();
    context.strokeStyle = '#bfdbfe';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#1d4ed8';
    context.fillText(skill, pillX + 23, pillY + 37);
    marks.push({ x: pillX - 5, y: pillY - 5, w: pillWidth + 10, h: 64 });
    pillX += pillWidth + 16;
  }
  context.restore();
  return { canvas, marks: marks.map((mark) => ({ x: mark.x * scale, y: mark.y * scale, w: mark.w * scale, h: mark.h * scale })) };
}

/** White-on-black mask of the keyword boxes, sampled by the page shader. */
export function drawKeywordMask(marks, width, height, maskWidth = 512) {
  const canvas = document.createElement('canvas');
  const scale = maskWidth / width;
  canvas.width = maskWidth;
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#fff';
  for (const mark of marks) {
    roundRect(context, mark.x * scale, mark.y * scale, mark.w * scale, mark.h * scale, Math.min(mark.h * scale / 2, 6));
    context.fill();
  }
  return canvas;
}

const bars = (context, x, y, widths, gap = 30, height = 12, color = '#e2e8f0') => {
  context.fillStyle = color;
  widths.forEach((w, index) => {
    roundRect(context, x, y + index * gap, w, height, height / 2);
    context.fill();
  });
  return y + widths.length * gap;
};

/** Alternative designs that peek out from behind the example resume. */
export function drawTemplate(kind, width = 768) {
  const { canvas, context, scale } = page(width);
  context.save();
  context.scale(scale, scale);
  if (kind === 'banner') {
    const gradient = context.createLinearGradient(0, 0, 1200, 300);
    gradient.addColorStop(0, '#059669');
    gradient.addColorStop(1, '#0d9488');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1200, 300);
    context.fillStyle = 'rgba(255,255,255,0.22)';
    context.beginPath();
    context.arc(196, 150, 78, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = `800 64px ${FONT}`;
    context.fillText('Jordan Lee', 320, 140);
    context.font = `500 32px ${FONT}`;
    context.fillStyle = '#d1fae5';
    context.fillText('Data Analyst', 320, 192);
    let y = 400;
    for (const block of [[980, 900, 760], [1000, 860, 940, 700], [920, 780], [960, 1000, 640]]) {
      context.fillStyle = '#047857';
      context.fillRect(100, y, 200, 18);
      y = bars(context, 100, y + 52, block, 36, 13) + 70;
    }
  } else {
    context.textAlign = 'center';
    context.fillStyle = '#1e1b4b';
    context.font = `700 70px ${SERIF}`;
    context.fillText('Sam Rivera', 600, 170);
    context.font = `italic 400 30px ${SERIF}`;
    context.fillStyle = '#6d28d9';
    context.fillText('Marketing Manager', 600, 222);
    context.textAlign = 'left';
    context.fillStyle = '#7c3aed';
    context.fillRect(380, 262, 440, 3);
    let y = 350;
    for (const block of [[1000, 940, 760], [980, 900, 1000, 820], [960, 880], [1000, 720, 860]]) {
      context.fillStyle = '#4c1d95';
      context.font = `700 26px ${SERIF}`;
      context.fillRect(100, y, 180, 16);
      context.fillStyle = '#ddd6fe';
      context.fillRect(300, y + 7, 800, 2);
      y = bars(context, 100, y + 52, block, 36, 13) + 70;
    }
  }
  context.restore();
  return canvas;
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
  context.font = `800 ${label.length > 3 ? 50 : 60}px ${FONT}`;
  context.fillText(label, 131, 206);
  return canvas;
}
