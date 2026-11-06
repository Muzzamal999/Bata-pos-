import { HTMLAttributes, ReactNode } from 'react';
import styles from './card.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}

export function Card({ title, subtitle, action, children, className, ...rest }: CardProps) {
  return (
    <div className={`${styles.card} ${className ?? ''}`} {...rest}>
      {(title || action) && (
        <div className={styles.header}>
          <div>
            {title && <p className={styles.title}>{title}</p>}
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
