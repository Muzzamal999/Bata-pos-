'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { isAxiosError } from 'axios';
import { identityApi } from '../../../lib/api';
import { useAuthStore } from '../../../lib/auth-store';
import { Button, Input } from '../../../components/ui';
import styles from './login.module.css';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  tenantId: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^[0-9a-f-]{36}$/i.test(v), 'Must be a valid UUID'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginFormValues) {
    setServerError(null);
    try {
      const tokens = await identityApi.login({
        email: values.email,
        password: values.password,
        tenantId: values.tenantId || undefined,
      });
      useAuthStore.getState().setSession(tokens.accessToken, tokens.refreshToken);
      const user = await identityApi.me();
      useAuthStore.getState().setUser(user);
      router.push('/select-branch');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        setServerError('Invalid email or password.');
      } else if (isAxiosError(error) && !error.response) {
        setServerError('Cannot reach the Identity service. Is it running?');
      } else {
        setServerError('Something went wrong. Please try again.');
      }
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.wordmark}>Bata</span>
        <p className={styles.title}>Cashier Login</p>

        {serverError && (
          <div className={styles.formError} role="alert">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className={styles.field}>
            <Input
              label="Email"
              type="email"
              autoComplete="username"
              error={errors.email?.message}
              {...register('email')}
            />
          </div>
          <div className={styles.field}>
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              error={errors.password?.message}
              suffix={
                <button
                  type="button"
                  className={styles.toggleVisibility}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a13.4 13.4 0 0 1-1.67 2.68M6.1 6.1C3.14 7.9 2 10 2 12c0 0 3 8 10 8a9.14 9.14 0 0 0 4.08-.94" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              }
              {...register('password')}
            />
          </div>

          <button
            type="button"
            className={styles.advancedToggle}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? 'Hide organization field' : 'Signing into a store account?'}
          </button>

          {showAdvanced && (
            <div className={styles.field}>
              <Input
                label="Organization ID"
                type="text"
                placeholder="Leave blank for a platform-level account"
                error={errors.tenantId?.message}
                {...register('tenantId')}
              />
            </div>
          )}

          <Button type="submit" loading={isSubmitting} style={{ width: '100%' }}>
            Sign In
          </Button>
        </form>
      </div>
    </div>
  );
}
