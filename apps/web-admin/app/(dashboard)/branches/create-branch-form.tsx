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
  name: z.string().min(2, 'Name must be at least 2 characters'),
  code: z.string().min(2, 'Code must be at least 2 characters'),
  address: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateBranchForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => identityApi.createBranch(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
      onDone();
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        setError('code', { message: 'A branch with this code already exists' });
      }
    },
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {mutation.isError &&
        !(isAxiosError(mutation.error) && mutation.error.response?.status === 409) && (
          <div className={styles.banner} role="alert">
            Could not create the branch. Please try again.
          </div>
        )}
      <Input label="Branch Name" placeholder="Gulberg Branch" error={errors.name?.message} {...register('name')} />
      <Input label="Branch Code" placeholder="GULBERG-01" error={errors.code?.message} {...register('code')} />
      <Input label="Address (optional)" error={errors.address?.message} {...register('address')} />
      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Create Branch
        </Button>
      </div>
    </form>
  );
}
