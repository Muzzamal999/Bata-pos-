import Link, { LinkProps } from 'next/link';
import { AnchorHTMLAttributes } from 'react';
import styles from './button.module.css';

export interface LinkButtonProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>,
    LinkProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}

/** A Link styled as a Button - for navigation, never use a <button> nested inside Next's <Link>. */
export function LinkButton({ variant = 'primary', size = 'md', className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={`${styles.button} ${styles[variant]} ${styles[size]} ${className ?? ''}`} {...rest}>
      {children}
    </Link>
  );
}
