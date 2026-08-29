/**
 * Prime PORTAL — Dialog props
 *
 * Spreads onto the modal container <div> to standardize the
 * accessibility surface across every dialog. The FocusTrap utility
 * requires the consumer to provide the ref; this just supplies the
 * ARIA attributes consistently.
 */

import type { HTMLAttributes } from 'react';

export interface DialogAriaProps {
  /** ID of the dialog's accessible title (e.g. an h3). */
  titleId: string;
}

export function getDialogAriaProps(
  { titleId }: DialogAriaProps
): Pick<HTMLAttributes<HTMLDivElement>, 'role' | 'aria-modal' | 'aria-labelledby'> {
  return {
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': titleId,
  };
}
