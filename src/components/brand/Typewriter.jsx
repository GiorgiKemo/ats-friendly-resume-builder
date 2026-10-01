import React, { useEffect, useState } from 'react';

/**
 * Types `text` one character at a time while `active`; shows it complete when
 * `done`, and nothing otherwise. A blinking caret follows while typing.
 */
const Typewriter = ({ text, active, done, speed = 70, className = '', caretClassName = '' }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) {
      setCount(done ? text.length : 0);
      return undefined;
    }
    setCount(0);
    const timer = setInterval(() => {
      setCount((current) => {
        if (current >= text.length) {
          clearInterval(timer);
          return current;
        }
        return current + 1;
      });
    }, speed);
    return () => clearInterval(timer);
  }, [active, done, text, speed]);

  return (
    <span className={className}>
      {text.slice(0, count)}
      {active && <span className={`typing-cursor ml-[0.05em] inline-block w-[0.08em] translate-y-[0.1em] self-stretch bg-current ${caretClassName}`} style={{ height: '0.9em' }} aria-hidden="true" />}
    </span>
  );
};

export default Typewriter;
