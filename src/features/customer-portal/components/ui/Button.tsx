import React from 'react';
import { Loader2 } from 'lucide-react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  children?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, { base: string; hover: string; active: string; disabled: string }> = {
  primary: {
    base: 'bg-slate-900 text-white',
    hover: 'hover:bg-slate-800',
    active: 'active:scale-[0.98]',
    disabled: 'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-900',
  },
  secondary: {
    base: 'bg-white text-slate-700 border border-slate-200',
    hover: 'hover:bg-slate-50 hover:border-slate-300',
    active: 'active:scale-[0.98]',
    disabled: 'disabled:opacity-50 disabled:cursor-not-allowed',
  },
  ghost: {
    base: 'text-slate-600',
    hover: 'hover:bg-slate-100 hover:text-slate-900',
    active: 'active:scale-[0.98]',
    disabled: 'disabled:opacity-50 disabled:cursor-not-allowed',
  },
  danger: {
    base: 'bg-rose-600 text-white',
    hover: 'hover:bg-rose-700',
    active: 'active:scale-[0.98]',
    disabled: 'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-rose-600',
  },
  success: {
    base: 'bg-emerald-600 text-white',
    hover: 'hover:bg-emerald-700',
    active: 'active:scale-[0.98]',
    disabled: 'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-600',
  },
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs font-bold rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm font-bold rounded-xl gap-2',
  lg: 'h-12 px-5 text-sm font-extrabold rounded-xl gap-2',
};

/**
 * Shared Button primitive — replaces ad-hoc class strings spread across tabs.
 *
 * Usage:
 *   <Button variant="primary" size="sm" loading={isSubmitting}>
 *     Submit
 *   </Button>
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  children,
  disabled,
  className = '',
  ...props
}, ref) => {
  const v = VARIANT_CLASSES[variant];
  const sizeClass = SIZE_CLASSES[size];

  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center transition-all duration-150 shadow-sm focus-ring ${sizeClass} ${v.base} ${v.hover} ${v.active} ${v.disabled} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : (
        <>
          {icon && iconPosition === 'left' && <span aria-hidden="true">{icon}</span>}
          {children}
          {icon && iconPosition === 'right' && <span aria-hidden="true">{icon}</span>}
        </>
      )}
    </button>
  );
});

Button.displayName = 'Button';
