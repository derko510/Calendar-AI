import { useMemo } from 'react';
import { toLinkSegments } from '../utils/linkify';

/**
 * Renders text (or a Google HTML description) with every http(s) URL as a safe external link.
 * The HTML is never injected: only its text and anchor hrefs are read.
 */
const LinkifiedText = ({ text, className = '', linkClassName = 'underline underline-offset-2 decoration-[#CFC7B8] hover:decoration-current [overflow-wrap:anywhere]' }) => {
  const segments = useMemo(() => toLinkSegments(text), [text]);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === 'link' ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClassName}
            onClick={(e) => e.stopPropagation()}
          >
            {seg.value}
          </a>
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
    </span>
  );
};

export default LinkifiedText;
