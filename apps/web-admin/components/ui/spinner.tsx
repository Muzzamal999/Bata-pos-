import styles from './spinner.module.css';

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className={styles.spinner}
      style={{ '--size': `${size}px` } as React.CSSProperties}
      role="status"
      aria-label="Loading"
    />
  );
}
