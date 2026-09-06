import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceAuthenticResumeSections } from '../src/utils/resumeAuthenticity.js';

// Independent held-out literal-quantity probes. These do not certify semantic
// truth or replace the immutable 30-case factual-tailoring diagnostic.
const rejected = [
  ['compound cardinal invention', 'Maintained customer reports.', 'Supported one hundred and twenty customers.'],
  ['compound cardinal amplification', 'Supported twenty-five customers.', 'Supported one hundred and twenty-five customers.'],
  ['hyphenated negative word', 'Recorded a negative twenty-five percent return.', 'Recorded a positive twenty-five percent return.'],
  ['Unicode minus removed', 'Recorded a −18% return.', 'Recorded an 18% return.'],
  ['ASCII minus removed', 'Recorded a -18% return.', 'Recorded an 18% return.'],
  ['negative word removed', 'Recorded a negative 18% return.', 'Recorded an 18% return.'],
  ['approximation removed', 'Handled approximately 320 requests daily.', 'Handled exactly 320 requests daily.'],
  ['tilde approximation removed', 'Handled ~320 requests daily.', 'Handled 320 requests daily.'],
  ['upper bound reversed', 'Handled up to 320 requests daily.', 'Handled at least 320 requests daily.'],
  ['strict bound made inclusive', 'Handled more than 320 requests daily.', 'Handled at least 320 requests daily.'],
  ['range collapsed to upper endpoint', 'Supported 12–18 stores.', 'Supported 18 stores.'],
  ['range direction changed', 'Supported 12 to 18 stores.', 'Supported 18 to 12 stores.'],
  ['numeric scale amplification', 'Managed a $4 thousand budget.', 'Managed a $4 million budget.'],
  ['abbreviated scale amplification', 'Managed a $4k budget.', 'Managed a $4m budget.'],
  ['currency changed', 'Managed a €40,000 budget.', 'Managed a $40,000 budget.'],
  ['currency code changed', 'Managed a 40,000 EUR budget.', 'Managed a 40,000 USD budget.'],
  ['percent versus percentage points', 'Improved completion by 12 percent.', 'Improved completion by 12 percentage points.'],
  ['time unit changed', 'Completed the migration in 6 months.', 'Completed the migration in 6 years.'],
  ['ambiguous lowercase m is not money scale evidence', 'Installed 8m of cable.', 'Managed 8 million dollars.'],
  ['ambiguous decimal comma is not a thousands separator', 'Measured an average latency of 1,5 ms.', 'Measured an average latency of 15 ms.'],
  ['fraction increased', 'Completed one quarter of the planned migration.', 'Completed three quarters of the planned migration.'],
  ['per-mille is not percent', 'Measured a 15‰ error rate.', 'Measured a 15% error rate.'],
];

const faithful = [
  ['compound cardinal to digits', 'Supported one hundred and twenty customers.', 'Served 120 customers.'],
  ['hyphenated cardinal to digits', 'Supported twenty-five customers.', 'Served 25 customers.'],
  ['negative word to signed digits', 'Recorded a negative eighteen percent return.', 'Recorded a -18% return.'],
  ['Unicode minus to ASCII minus', 'Recorded a −18% return.', 'Recorded a -18% return.'],
  ['approximation wording preserved', 'Handled approximately 320 requests daily.', 'Handled about 320 requests daily.'],
  ['tilde to approximation word', 'Handled ~320 requests daily.', 'Handled approximately 320 requests daily.'],
  ['upper-bound wording preserved', 'Handled up to 320 requests daily.', 'Handled at most 320 requests daily.'],
  ['strict-bound symbol preserved', 'Handled more than 320 requests daily.', 'Handled >320 requests daily.'],
  ['range dash normalized', 'Supported 12–18 stores.', 'Served 12 to 18 stores.'],
  ['currency and scale expanded', 'Managed a $2.75 million budget.', 'Oversaw a $2,750,000 budget.'],
  ['currency scale abbreviation expanded', 'Managed a $425k budget.', 'Oversaw a $425,000 budget.'],
  ['currency code unambiguous equivalence', 'Managed a USD 40,000 budget.', 'Oversaw a 40,000 USD budget.'],
  ['decimal percent word equivalence', 'Reduced defects by 12.5 per cent.', 'Reduced defects by 12.5%.'],
  ['full-width numeric normalization', 'Reduced defects by １２.５％.', 'Reduced defects by 12.5%.'],
  ['thousands separator preserved', 'Served 12,000 customers.', 'Supported 12,000 customers.'],
  ['nonnumeric prose remains useful', 'Maintained customer reports.', 'Kept customer reports current.'],
];

const rewrite = (original, proposed) => {
  const source = { workExperience: [{ title: 'Operations analyst', company: 'Harbor', description: original }] };
  const before = structuredClone(source);
  const result = enforceAuthenticResumeSections({ workExperience: [{
    title: 'Operations analyst', company: 'Harbor', description: proposed,
  }] }, source);
  assert.deepEqual(source, before, 'Quantity evaluation must not mutate the candidate evidence');
  return result.workExperience[0].description;
};

for (const [label, original, proposed] of rejected) {
  test(`held-out quantity rejects ${label}`, () => {
    assert.equal(rewrite(original, proposed), original, `Unsupported proposal: ${proposed}`);
  });
}

for (const [label, original, proposed] of faithful) {
  test(`held-out quantity preserves ${label}`, () => {
    assert.equal(rewrite(original, proposed), proposed, `Faithful proposal: ${proposed}`);
  });
}

// Added after reviewing the first implementation; not part of the 38-case
// independently derived baseline above.
test('post-review quantity rejects conflicting prefix and suffix currencies', () => {
  assert.equal(rewrite('Managed USD 400.', 'Managed USD 400 EUR.'), 'Managed USD 400.');
});

for (const fraction of ['1/2', '½']) {
  test(`post-review quantity cannot invert the ordered fraction ${fraction}`, () => {
    const original = `Completed ${fraction} of the project.`;
    assert.equal(rewrite(original, 'Completed 2/1 of the project.'), original);
  });
}

for (const [script, quantity, changed] of [
  ['Arabic-Indic', '١٢', '١٣'], ['Persian', '۱۲', '۱۳'], ['Devanagari', '१२', '१३'],
]) {
  test(`post-review quantity retains prior literal detection for ${script} digits without requiring transliteration`, () => {
    const empty = 'Maintained customer reports.';
    const original = `Supported ${quantity} customers.`;
    assert.equal(rewrite(empty, original), empty, 'A new numeric script must not hide an invented amount');
    assert.equal(rewrite(original, `Served ${changed} customers.`), original, 'Changed literal digits cannot be silently accepted');
    assert.equal(rewrite(original, `Served ${quantity} customers.`), `Served ${quantity} customers.`);
  });
}

for (const fraction of ['1/2', '½']) {
  test(`post-review quantity preserves the same explicit fraction ${fraction}`, () => {
    const proposed = 'Finished 1/2 of the project.';
    assert.equal(rewrite(`Completed ${fraction} of the project.`, proposed), proposed);
  });
}
