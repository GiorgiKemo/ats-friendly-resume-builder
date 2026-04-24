const getPageItems = (currentPage, totalPages) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage]);
  if (currentPage > 2) pages.add(currentPage - 1);
  if (currentPage < totalPages - 1) pages.add(currentPage + 1);
  if (currentPage <= 3) pages.add(2);
  if (currentPage >= totalPages - 2) pages.add(totalPages - 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const items = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) {
      items.push(`ellipsis-${sorted[index - 1]}-${page}`);
    }
    items.push(page);
  });
  return items;
};

const Pagination = ({
  currentPage,
  totalPages,
  onPageChange,
  totalItems = 0,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  itemLabel = 'items',
  className = '',
}) => {
  const normalizedTotalPages = Math.max(1, Number(totalPages) || 1);
  const normalizedCurrentPage = Math.min(Math.max(1, Number(currentPage) || 1), normalizedTotalPages);
  const shouldRenderControls = normalizedTotalPages > 1;
  const startItem = totalItems > 0 && pageSize ? ((normalizedCurrentPage - 1) * pageSize) + 1 : 0;
  const endItem = totalItems > 0 && pageSize ? Math.min(totalItems, normalizedCurrentPage * pageSize) : 0;

  if (!shouldRenderControls && !onPageSizeChange && totalItems === 0) return null;

  const goToPage = (page) => {
    const nextPage = Math.min(Math.max(1, page), normalizedTotalPages);
    if (nextPage !== normalizedCurrentPage) {
      onPageChange(nextPage);
    }
  };

  return (
    <nav
      className={`flex flex-col gap-3 border-t border-gray-200 px-4 py-3 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between ${className}`}
      aria-label="Pagination"
    >
      <div className="text-sm text-slate-500 dark:text-slate-400">
        {totalItems > 0 && pageSize ? (
          <>Showing <span className="font-medium text-slate-700 dark:text-slate-200">{startItem}-{endItem}</span> of <span className="font-medium text-slate-700 dark:text-slate-200">{totalItems}</span> {itemLabel}</>
        ) : totalItems > 0 ? (
          <>{totalItems} {itemLabel}</>
        ) : (
          <>No {itemLabel}</>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            Rows
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>
        )}

        {shouldRenderControls && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => goToPage(normalizedCurrentPage - 1)}
              disabled={normalizedCurrentPage === 1}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Previous
            </button>

            {getPageItems(normalizedCurrentPage, normalizedTotalPages).map((item) => (
              typeof item === 'number' ? (
                <button
                  key={item}
                  type="button"
                  onClick={() => goToPage(item)}
                  aria-current={item === normalizedCurrentPage ? 'page' : undefined}
                  className={`min-w-9 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    item === normalizedCurrentPage
                      ? 'bg-blue-600 text-white dark:bg-blue-500'
                      : 'border border-gray-300 bg-white text-slate-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {item}
                </button>
              ) : (
                <span key={item} className="px-2 text-slate-400 dark:text-slate-500">...</span>
              )
            ))}

            <button
              type="button"
              onClick={() => goToPage(normalizedCurrentPage + 1)}
              disabled={normalizedCurrentPage === normalizedTotalPages}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Pagination;
