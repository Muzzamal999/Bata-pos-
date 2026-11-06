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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

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
      router.push('/');
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
      <section className={styles.hero} aria-hidden="true">
        <div className={styles.heroLogo}>
          <span className={styles.wordmark}>Bata</span>
          <span className={styles.heroTagline}>
            Better Shoes
            <br />A Brighter Future
          </span>
        </div>
        <p className={styles.heroEyebrow}>Welcome to Bata POS</p>
        <h1 className={styles.heroHeadline}>
          Step Into
          <span>A Better Tomorrow</span>
        </h1>
        <p className={styles.heroSubtext}>
          Manage your store. Track your inventory. Serve your customers better.
        </p>
        <div className={styles.heroFeatures}>
          <div className={styles.heroFeature}>
            <span>Premium Footwear</span>
          </div>
          <div className={styles.heroFeature}>
            <span>Trusted Worldwide</span>
          </div>
          <div className={styles.heroFeature}>
            <span>Fast & Reliable Service</span>
          </div>
          <div className={styles.heroFeature}>
            <span>Style for Every Step</span>
          </div>
        </div>
      </section>

      <section className={styles.formSide}>
        <div className={styles.formCard}>
          <div className={styles.formLogo}>
            <span className={styles.wordmark}>Bata</span>
          </div>
          <h2 className={styles.formTitle}>POS System</h2>
          <p className={styles.formSubtitle}>Sign in to your account to continue</p>

          {serverError && (
            <div className={styles.formError} role="alert">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className={styles.field}>
              <Input
                label="Email Address"
                id="email"
                type="email"
                autoComplete="username"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>

            <div className={styles.field}>
              <Input
                label="Password"
                id="password"
                type="password"
                autoComplete="current-password"
                error={errors.password?.message}
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
                  id="tenantId"
                  type="text"
                  placeholder="Leave blank for platform admin"
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
      </section>
    </div>
  );
}
