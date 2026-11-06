import { InputHTMLAttributes, forwardRef, useId } from 'react';
import styles from './input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Rendered inside the input's own wrapper, absolutely positioned over its right edge (e.g. a show/hide password toggle). */
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, suffix, id, className, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={styles.wrapper}>
      {label && (
        <label className={styles.label} htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={styles.inputRow}>
        <input
          ref={ref}
          id={inputId}
          className={`${styles.input} ${error ? styles.inputError : ''} ${className ?? ''}`}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...rest}
        />
        {suffix}
      </div>
      {error && (
        <p id={`${inputId}-error`} className={styles.errorText}>
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={`${inputId}-hint`} className={styles.hintText}>
          {hint}
        </p>
      )}
    </div>
  );
});
