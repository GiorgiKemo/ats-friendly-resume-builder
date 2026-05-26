import React from 'react';
import PropTypes from 'prop-types';

/**
 * Anchored hero for content pages (Learn, About, Pricing, FAQ, etc.).
 *
 * Renders a full-bleed gradient block that sits BEHIND the transparent
 * fixed header so the page title never floats in a white void. Pages should
 * place this as the first child of their root <main> wrapper, then follow it
 * with an `.app-page` container for the rest of the content.
 */
const PageHero = ({
  eyebrow,
  title,
  lead,
  align = 'left',
  wide = false,
  children,
  className = '',
  innerClassName = '',
  titleId,
}) => {
  const alignClass = align === 'center' ? 'text-center mx-auto' : 'text-left';
  return (
    <section
      className={`app-page-hero ${wide ? 'app-page-hero--wide' : ''} ${className}`.trim()}
    >
      <div className={`app-page-hero-inner ${innerClassName}`.trim()}>
        <div className={align === 'center' ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
          {eyebrow ? (
            <p className="app-page-hero-eyebrow mb-4">{eyebrow}</p>
          ) : null}
          {title ? (
            <h1
              id={titleId}
              className={`app-page-hero-title text-gray-900 dark:text-slate-50 ${alignClass}`.trim()}
            >
              {title}
            </h1>
          ) : null}
          {lead ? (
            <p className={`app-page-hero-lead mt-4 ${align === 'center' ? 'mx-auto' : ''}`.trim()}>
              {lead}
            </p>
          ) : null}
          {children ? <div className="mt-6">{children}</div> : null}
        </div>
      </div>
    </section>
  );
};

PageHero.propTypes = {
  eyebrow: PropTypes.node,
  title: PropTypes.node,
  lead: PropTypes.node,
  align: PropTypes.oneOf(['left', 'center']),
  wide: PropTypes.bool,
  children: PropTypes.node,
  className: PropTypes.string,
  innerClassName: PropTypes.string,
  titleId: PropTypes.string,
};

export default PageHero;
