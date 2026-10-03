import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const size = (name) => fs.statSync(new URL(`../src/assets/fonts/${name}`, import.meta.url)).size;

test('browser resume preview uses compact WOFF2 while PDF export retains source TTF fonts', () => {
  const styles = read('src/styles/resume-document.css');
  const pdf = read('src/services/resumePdfDocument.js');

  for (const [weight, font] of [['Regular', 400], ['Bold', 700]]) {
    assert.match(styles, new RegExp(`Inter-${weight}\\.woff2'\\) format\\('woff2'\\)`));
    assert.match(styles, new RegExp(`font-weight: ${font};`));
    assert.ok(size(`Inter-${weight}.woff2`) < size(`Inter-${weight}.ttf`) * 0.5);
    assert.match(pdf, new RegExp(`Inter-${weight}\\.ttf`));
  }
});
