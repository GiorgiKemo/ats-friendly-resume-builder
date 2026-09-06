import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceAuthenticResumeSections } from '../src/utils/resumeAuthenticity.js';

const rewrite = (sourceText, proposal) => {
  const source = { workExperience: [{ title: 'Analyst', company: 'Cedar', description: sourceText }] };
  return enforceAuthenticResumeSections({ workExperience: [{ title: 'Analyst', company: 'Cedar', description: proposal }] }, source).workExperience[0].description;
};

const rejected = [
  ['invented spelled tenure', 'Built accessible pages.', 'Built pages with twelve years of experience.'],
  ['invented Japanese tenure', '翻訳チームを支援した。', '十年間の翻訳経験を持つ。'],
  ['versions are not scaled customer counts', 'Built a local HTTP 2 experiment using Node.js 20.', 'Served 2 million customers and led 20 engineers.'],
  ['minutes are not a scaled budget', 'Supported 50 customer accounts. Cut duration from 30 minutes to 20 minutes.', 'Led 50 engineers and managed a 30 million dollar budget.'],
  ['Japanese approximation must remain', '約十五年間にわたり翻訳した。', '十五年間にわたり翻訳した。'],
  ['English tenure unit must remain', 'Worked for twelve months.', 'Worked for twelve years.'],
  ['percentage-point unit must remain', 'Improved by three percentage points.', 'Improved by three percent.'],
  ['source exact quantity cannot authorize a higher spelled quantity', 'Managed a two million dollar budget.', 'Managed a three million dollar budget.'],
  ['dollar symbol does not identify USD', 'Managed $40k.', 'Managed 40k USD.'],
  ['dollar symbol does not identify CAD', 'Managed $40k.', 'Managed 40k CAD.'],
  ['yen or yuan symbol does not identify JPY', 'Managed ¥40000.', 'Managed 40000 JPY.'],
  ['yen or yuan symbol does not identify CNY', 'Managed ¥40000.', 'Managed 40000 CNY.'],
  ['pounds do not identify GBP', 'Handled 40 pounds.', 'Handled 40 GBP.'],
  ['spelled dollars do not identify USD', 'Managed 40 dollars.', 'Managed 40 USD.'],
  ['intermediate scale conjunction cannot hide invented quantity', 'Managed budgets.', 'Managed one million and two hundred thousand dollars.'],
  ['untyped version spelling is not a decimal quantity', 'Used version 1.20.', 'Used version 1.2.'],
  ['negated upper bound cannot reverse', 'Handled not more than 40 requests.', 'Handled more than 40 requests.'],
  ['negated lower bound cannot reverse', 'Handled not less than 40 requests.', 'Handled less than 40 requests.'],
  ['no less than cannot reverse', 'Handled no less than 40 requests.', 'Handled less than 40 requests.'],
  ['percent unit cannot discard a currency prefix', 'Reduced defects by 25%.', 'Reduced defects by $25%.'],
  ['currency cannot discard a duration suffix', 'Managed $400.', 'Managed $400 years.'],
  ['a leading decimal point cannot hide a new quantity', 'Measured defects.', 'Measured .25% defects.'],
  ['NFKC cannot concatenate a superscript exponent', 'Handled 103 requests.', 'Handled 10³ requests.'],
  ['caret exponent cannot borrow separate numeric evidence', 'Used version 10 and handled 3 requests.', 'Handled 10^3 requests.'],
  ['scientific exponent cannot borrow separate numeric evidence', 'Used version 1 and handled 6 requests.', 'Handled 1e6 requests.'],
  ['plus-minus uncertainty cannot disappear', 'Measured ±5% variance.', 'Measured 5% variance.'],
  ['Japanese digit-only duration cannot round its source value', 'Worked for 9007199254740992 years.', 'Worked for 9007199254740993年間.'],
];
const faithful = [
  ['English spelled duration', 'Worked for twelve years.', 'Contributed for 12 years.'],
  ['Japanese duration spelling', '十五年間にわたり翻訳した。', '15年間にわたり翻訳した。'],
  ['Japanese approximate duration', '約十五年間にわたり翻訳した。', 'およそ15年間にわたり翻訳した。'],
  ['word percent equivalence', 'Reduced tickets by twenty-five percent.', 'Cut tickets by 25%.'],
  ['signed scaled currency', 'Managed a negative two million dollar balance.', 'Recorded a -2000000 dollar balance.'],
  ['bound and duration preserved', 'Worked for at least twelve months.', 'Contributed for no fewer than 12 months.'],
  ['ambiguous dollar symbol preserved', 'Managed $40k.', 'Managed $40,000.'],
  ['ambiguous yen or yuan symbol preserved', 'Managed ¥40k.', 'Managed ¥40,000.'],
  ['explicit ISO currency preserved', 'Managed GBP 40k.', 'Managed 40,000 GBP.'],
  ['multiple spelled scales preserve their value', 'Managed one million and two hundred thousand dollars.', 'Managed 1200000 dollars.'],
  ['negated upper bound equivalence', 'Handled not more than 40 requests.', 'Handled at most 40 requests.'],
  ['negated lower bound equivalence', 'Handled not less than 40 requests.', 'Handled at least 40 requests.'],
  ['no less than equivalence', 'Handled no less than 40 requests.', 'Handled no fewer than 40 requests.'],
  ['leading decimal point preserves its literal value', 'Measured .25% defects.', 'Recorded .25% defects.'],
  ['superscript exponent preserves the same expression', 'Handled 10³ requests.', 'Served 10³ requests.'],
  ['caret exponent preserves the same expression', 'Handled 10^3 requests.', 'Served 10^3 requests.'],
  ['scientific exponent preserves the same expression', 'Handled 1e6 requests.', 'Served 1e6 requests.'],
  ['plus-minus uncertainty remains explicit', 'Measured ±5% variance.', 'Recorded ±5% variance.'],
  ['nonnumeric rewrite remains available', 'Built accessible pages.', 'Created accessible pages.'],
];

for (const [name, original, proposed] of rejected) {
  test(`quantity guard rejects ${name}`, () => assert.equal(rewrite(original, proposed), original));
}
for (const [name, original, proposed] of faithful) {
  test(`quantity guard preserves ${name}`, () => assert.equal(rewrite(original, proposed), proposed));
}

test('literal quantity checks do not claim to verify the metric or action meaning', () => {
  assert.equal(rewrite('Reduced support tickets by 25%.', 'Grew revenue by 25%.'), 'Grew revenue by 25%.');
});
