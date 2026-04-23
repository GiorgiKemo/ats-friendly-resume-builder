export const filterFaqItems = (items, searchQuery = '') => {
  const query = `${searchQuery}`.trim().toLowerCase();
  if (!query) return items;

  return items.filter((faq) => (
    faq.question.toLowerCase().includes(query)
    || faq.answer.toLowerCase().includes(query)
  ));
};
