'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { productInventoryApi } from '../../../../lib/api';
import { Button, Input } from '../../../../components/ui';
import styles from '../../components/admin-page.module.css';

const schema = z.object({
  variantId: z.string().uuid('Must be a valid variant ID'),
  expectedQty: z.coerce.number().int().positive('Must be greater than 0'),
});

type FormValues = z.infer<typeof schema>;

export function AddLineForm({ receiptId, onDone }: { receiptId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => productInventoryApi.addReceiptLine(receiptId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receipt', receiptId] });
      onDone();
    },
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {mutation.isError && (
        <div className={styles.banner} role="alert">
          Could not add this line. Check the variant ID and try again.
        </div>
      )}
      <Input label="Variant ID" placeholder="UUID of the product variant" error={errors.variantId?.message} {...register('variantId')} />
      <Input label="Expected Quantity" type="number" error={errors.expectedQty?.message} {...register('expectedQty')} />
      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Add Line
        </Button>
      </div>
    </form>
  );
}
