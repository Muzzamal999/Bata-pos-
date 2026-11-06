'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { productInventoryApi } from '../../../../lib/api';
import { Button, Input } from '../../../../components/ui';
import styles from '../../components/admin-page.module.css';

const schema = z.object({
  size: z.string().min(1, 'Size is required'),
  color: z.string().min(1, 'Color is required'),
  sku: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateVariantForm({ productId, onDone }: { productId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      productInventoryApi.createVariant(productId, { ...values, sku: values.sku || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variants', productId] });
      onDone();
    },
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {mutation.isError && (
        <div className={styles.banner} role="alert">
          Could not create the variant. Please try again.
        </div>
      )}
      <Input label="Size" placeholder="42" error={errors.size?.message} {...register('size')} />
      <Input label="Color" placeholder="Black" error={errors.color?.message} {...register('color')} />
      <Input
        label="SKU (optional)"
        hint="Auto-generated from article number + size + color if left blank."
        error={errors.sku?.message}
        {...register('sku')}
      />
      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Create Variant
        </Button>
      </div>
    </form>
  );
}
