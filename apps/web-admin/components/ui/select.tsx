import { SelectHTMLAttributes, forwardRef, useId } from 'react';
import styles from './input.module.css';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, id, className, children, ...rest },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={styles.wrapper}>
      {label && (
        <label className={styles.label} htmlFor={selectId}>
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={`${styles.input} ${error ? styles.inputError : ''} ${className ?? ''}`}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
        {...rest}
      >
        {children}
      </select>
      {error && (
        <p id={`${selectId}-error`} className={styles.errorText}>
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${selectId}-hint`} className={styles.hintText}>
          {hint}
        </p>
      )}
    </div>
  );
});
