import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children?: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, children, className = '', ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={`icon-button ${className}`.trim()}
        aria-label={label}
        title={props.title ?? label}
        {...props}
      >
        {children}
      </button>
    );
  },
);
