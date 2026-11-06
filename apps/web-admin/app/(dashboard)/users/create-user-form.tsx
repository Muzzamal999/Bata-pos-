'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { identityApi } from '../../../lib/api';
import { Button, Input } from '../../../components/ui';
import styles from '../components/admin-page.module.css';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

export function CreateUserForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => identityApi.createUser(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onDone();
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        setError('email', { message: 'A user with this email already exists' });
      }
    },
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {mutation.isError && !(isAxiosError(mutation.error) && mutation.error.response?.status === 409) && (
        <div className={styles.banner} role="alert">
          Could not create the user. Please try again.
        </div>
      )}
      <Input label="First Name" error={errors.firstName?.message} {...register('firstName')} />
      <Input label="Last Name" error={errors.lastName?.message} {...register('lastName')} />
      <Input label="Email Address" type="email" error={errors.email?.message} {...register('email')} />
      <Input
        label="Temporary Password"
        type="password"
        hint="At least 8 characters. The user can change it after signing in."
        error={errors.password?.message}
        {...register('password')}
      />
      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Create User
        </Button>
      </div>
    </form>
  );
}
