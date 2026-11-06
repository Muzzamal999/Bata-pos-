import { HTMLAttributes } from 'react';
import styles from './badge.module.css';

export type BadgeVariant =
  | 'admin'
  | 'staff'
  | 'customer'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]} ${className ?? ''}`} {...rest}>
      {children}
    </span>
  );
}
