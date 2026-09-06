// Literal quantity provenance only: this does not decide what a metric measures,
// who performed an action, or whether a rewrite entails its cited source.
const smallNumbers = Object.fromEntries('zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ').map((word, index) => [word, index]));
const tens = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const scales = { thousand: 3, million: 6, billion: 9 };
const countUnits = 'customer\\s+accounts?|customers?|accounts?|requests?|stores?|people|employees?|engineers?|users?|teams?|projects?|reports?|tickets?';
const units = `percentage\\s+points?|per\\s+cent|percent|[%‰]|years?|months?|weeks?|days?|hours?|minutes?|seconds?|milliseconds?|ms|quarters?|USD|EUR|GBP|JPY|dollars?|euros?|pounds?|yen|${countUnits}`;
const qualifiers = 'not\\s+more\\s+than|not\\s+less\\s+than|no\\s+less\\s+than|no\\s+fewer\\s+than|no\\s+more\\s+than|at\\s+least|at\\s+most|more\\s+than|less\\s+than|up\\s+to|approximately|approx\\.?|about|around|roughly|nearly|almost|exactly|[<>]=?|[~≈≤≥±]';
const currency = '[$€£¥]|USD\\b|EUR\\b|GBP\\b|JPY\\b';
// Exponents remain indivisible literal expressions; no arithmetic is inferred.
const numeral = '(?:\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+|\\^[+-]?\\d+)|\\d+\\s*[/⁄]\\s*\\d+|\\d+(?:[.,]\\d+)*|\\.\\d+|\\p{N}+)';
const scale = '(?:thousand|million|billion)\\b|[kmb](?![a-z])';
// Do not retry a failing range from every digit inside the same long numeral.
const prefix = `(?<![\\p{N}.,/^⁄])(?<qualifier>${qualifiers})?\\s*(?<sign>[+-]|negative\\s+|positive\\s+|minus\\s+|plus\\s+)?\\s*(?<currency>${currency})?\\s*`;
const suffix = `(?<scale>\\s*(?:${scale}))?(?<unit>\\s*(?:${units})(?![a-z]))?`;
const atom = new RegExp(`${prefix}(?<number>${numeral})${suffix}`, 'giu');
const range = new RegExp(`${prefix}(?<number>${numeral})\\s*(?:[–—-]|\\bto\\b)\\s*(?<end>[+-]?${numeral})${suffix}`, 'giu');
const words = [...Object.keys(smallNumbers), ...Object.keys(tens), 'hundred', ...Object.keys(scales)].join('|');
const wordPhrase = new RegExp(`\\b(?:${words})(?:[ -]+(?:and[ -]+)?(?:${words}))*\\b`, 'gi');
const explicitUnit = new RegExp(`^\\s*(?:${units})(?![a-z])`, 'i');

const underThousand = (tokens) => {
  let value = 0;
  if (tokens[1] === 'hundred' && smallNumbers[tokens[0]] > 0 && smallNumbers[tokens[0]] < 10) {
    value = smallNumbers[tokens[0]] * 100;
    tokens = tokens.slice(2);
    if (tokens[0] === 'and') tokens = tokens.slice(1);
  }
  if (!tokens.length) return value || null;
  if (tokens.length === 1 && Object.hasOwn(smallNumbers, tokens[0])) return value + smallNumbers[tokens[0]];
  if (tokens.length === 1 && tens[tokens[0]]) return value + tens[tokens[0]];
  if (tokens.length === 2 && tens[tokens[0]] && smallNumbers[tokens[1]] > 0 && smallNumbers[tokens[1]] < 10) return value + tens[tokens[0]] + smallNumbers[tokens[1]];
  return null;
};

const englishCardinal = (phrase) => {
  const tokens = phrase.toLowerCase().split(/[ -]+/);
  let total = 0;
  let pending = [];
  let previousScale = Infinity;
  for (const token of tokens) {
    if (!scales[token]) { pending.push(token); continue; }
    if (pending[0] === 'and' && total) pending.shift();
    const part = underThousand(pending);
    if (part === null || scales[token] >= previousScale) return null;
    total += part * 10 ** scales[token];
    previousScale = scales[token];
    pending = [];
  }
  if (pending[0] === 'and' && total) pending.shift();
  const rest = pending.length ? underThousand(pending) : 0;
  return rest === null ? null : total + rest;
};

const japaneseCardinal = (phrase) => {
  const digits = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const powers = { '十': 10, '百': 100, '千': 1000 };
  if (/^\d+$/.test(phrase)) return phrase;
  if (![...phrase].some((character) => powers[character])) return [...phrase].map((character) => digits[character]).join('');
  let total = 0;
  let digit = null;
  let previousPower = Infinity;
  for (const character of phrase) {
    if (Object.hasOwn(digits, character)) {
      if (digit !== null) return null;
      digit = digits[character];
    } else {
      const power = powers[character];
      if (!power || power >= previousPower) return null;
      total += (digit ?? 1) * power;
      previousPower = power;
      digit = null;
    }
  }
  return total + (digit ?? 0);
};

const normalizeProse = (value) => {
  // The private scan view bounds optional whitespace backtracking. The caller
  // still returns the exact original source/proposal, never this normalized text.
  // Protect superscript exponents before NFKC can concatenate their digits.
  // Other non-ASCII numerals remain opaque; full-width digits and explicit
  // vulgar fractions retain the previously supported NFKC spelling equivalence.
  let text = value.replace(/(?<=[\d０-９])([⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]+)/g, (_original, exponent) => `^${exponent.normalize('NFKC')}`)
    .split(/(\p{N}+)/u)
    .map((part) => /^\p{N}+$/u.test(part) ? part.replace(/[０-９¼½¾⅐-⅟]/g, (digit) => digit.normalize('NFKC')) : part.normalize('NFKC'))
    .join('').replace(/−/g, '-').replace(/\s+/g, ' ');
  // Explicit duration compounds only; a bare Japanese 年 can be a calendar year.
  text = text.replace(/(?<![\d〇零一二三四五六七八九十百千])(約|およそ)?([\d〇零一二三四五六七八九十百千]+)(年間|か月間|ヶ月間|箇月間|週間|日間)/g, (original, qualifier, number, unit) => {
    const parsed = japaneseCardinal(number);
    if (parsed === null) return original;
    const duration = { '年間': 'years', 'か月間': 'months', 'ヶ月間': 'months', '箇月間': 'months', '週間': 'weeks', '日間': 'days' }[unit];
    return ` ${qualifier ? 'about ' : ''}${parsed} ${duration} `;
  });
  text = text.replace(wordPhrase, (original, offset, whole) => {
    if (!explicitUnit.test(whole.slice(offset + original.length)) && !/\b(?:thousand|million|billion)\b/i.test(original)) return original;
    const parsed = englishCardinal(original);
    return parsed === null ? original : String(parsed);
  });
  // Keep a sign ahead of a currency symbol in the common $-20 spelling.
  return text.replace(/([$€£¥])\s*([+-])(?=\s*\d)/g, '$2$1');
};

const relation = (value = '') => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^(?:approximately|approx\.?|about|around|roughly|~|≈)$/.test(normalized)) return 'approx';
  if (['at least', 'no fewer than', 'not less than', 'no less than', '>=', '≥'].includes(normalized)) return 'gte';
  if (['at most', 'no more than', 'not more than', 'up to', '<=', '≤'].includes(normalized)) return 'lte';
  if (['more than', '>'].includes(normalized)) return 'gt';
  if (['less than', '<'].includes(normalized)) return 'lt';
  // Nearly/almost are not interchangeable with an unconstrained approximation.
  return normalized === 'exactly' ? '' : normalized;
};

// Symbols and words do not establish an ISO currency (pounds may even be weight).
const currencyUnit = (value = '') => ({ '$': '$', usd: 'USD', dollar: 'dollar', dollars: 'dollar', '€': '€', eur: 'EUR', euro: 'euro', euros: 'euro', '£': '£', gbp: 'GBP', pound: 'pound', pounds: 'pound', '¥': '¥', jpy: 'JPY', yen: 'yen' }[value.trim().toLowerCase()] || '');
const canonicalNumber = (raw, power, groupedCurrency) => {
  let value = raw;
  if (groupedCurrency && /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(value)) value = value.replace(/,/g, '');
  // Decimal commas and multiple dots are not silently reinterpreted.
  if (!/^\d+(?:\.\d+)?$/.test(value)) return `${value}e${power}`;
  const [whole, fraction = ''] = value.split('.');
  const digits = whole + fraction;
  const split = whole.length + power;
  const expanded = split >= digits.length ? digits.padEnd(split, '0') : `${digits.slice(0, split)}.${digits.slice(split)}`;
  return expanded.replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
};

const quantity = (groups, number = groups.number) => {
  const suffixUnit = (groups.unit || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const prefixMoney = currencyUnit(groups.currency);
  const suffixMoney = currencyUnit(suffixUnit);
  const money = prefixMoney && suffixMoney && prefixMoney !== suffixMoney ? `${prefixMoney}:${suffixMoney}` : prefixMoney || suffixMoney;
  const magnitude = (groups.scale || '').trim().toLowerCase();
  const power = scales[magnitude] || (money ? { k: 3, m: 6, b: 9 }[magnitude] || 0 : 0);
  let normalizedSuffix = suffixUnit.replace(/s$/, '');
  if (['%', 'percent', 'per cent'].includes(suffixUnit)) normalizedSuffix = '%';
  if (suffixUnit === 'milliseconds' || suffixUnit === 'millisecond' || suffixUnit === 'ms') normalizedSuffix = 'ms';
  // Keep every parsed dimension, even contradictory currency/time/percent pairs.
  let unit = prefixMoney && suffixUnit && !suffixMoney
    ? `${prefixMoney}:${normalizedSuffix}` : money || normalizedSuffix;
  // Unqualified m/k/b are ambiguous, not evidence of millions/thousands.
  if (magnitude && !power) unit = `ambiguous:${magnitude}:${unit}`;
  const signed = /^(?:negative|minus|-)/i.test((groups.sign || '').trim()) ? '-'
    : /^(?:positive|plus|\+)/i.test((groups.sign || '').trim()) ? '+' : '';
  const rawSign = /^[+-]/.test(number) ? number[0] : '';
  const literal = number.replace(/^[+-]/, '').replace(/\s*[/⁄]\s*/g, '/');
  // Untyped numbers can be versions/identifiers; decimal rewriting is not safe.
  const value = unit || magnitude ? canonicalNumber(literal, power, Boolean(money)) : literal;
  return [relation(groups.qualifier), signed || rawSign, value, unit].join('|');
};

const strings = (value) => Array.isArray(value) ? value.flatMap(strings) : typeof value === 'string' ? [value] : [];

export const resumeQuantityTokens = (value) => strings(value).flatMap((original) => {
  const tokens = [];
  const text = normalizeProse(original).replace(range, (...args) => {
    const groups = args.at(-1);
    tokens.push(`range:${quantity(groups)}:${quantity({ ...groups, sign: '' }, groups.end)}`);
    return ' ';
  });
  for (const match of text.matchAll(atom)) tokens.push(quantity(match.groups));
  return tokens;
});
