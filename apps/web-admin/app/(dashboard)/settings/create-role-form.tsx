'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { identityApi } from '../../../lib/api';
import { Button, Input } from '../../../components/ui';
import styles from '../components/admin-page.module.css';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateRoleForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => identityApi.createRole(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] });
      onDone();
    },
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {mutation.isError && (
        <div className={styles.banner} role="alert">
          Could not create the role. Please try again.
        </div>
      )}
      <Input label="Role Name" placeholder="Regional Supervisor" error={errors.name?.message} {...register('name')} />
      <Input label="Description (optional)" error={errors.description?.message} {...register('description')} />
      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Create Role
        </Button>
      </div>
    </form>
  );
}
