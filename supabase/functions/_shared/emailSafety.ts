// Values entering email headers or HTML can originate in external job postings.
export const isSingleEmailAddress = (value: string): boolean => (
  typeof value === 'string' &&
  value.length <= 254 &&
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(value)
);

export const escapeEmailHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]!));

export const buildApplicationEmailHtml = (coverLetter: string, replyEmail = '') => {
  const paragraphs = coverLetter.split('\n')
    .filter((line) => line.trim())
    .map((line) => `<p style="margin: 0 0 12px 0;">${escapeEmailHtml(line)}</p>`)
    .join('');
  const contact = isSingleEmailAddress(replyEmail)
    ? `<p style="font-size: 13px; color: #666; margin-top: 16px;">You can also reach me at: <a href="mailto:${escapeEmailHtml(replyEmail)}">${escapeEmailHtml(replyEmail)}</a></p>`
    : '';
  return `<div style="font-family: Arial, sans-serif; max-width: 600px; line-height: 1.6; color: #333;">${paragraphs}${contact}</div>`;
};
