'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { identityApi, productInventoryApi } from '../../../lib/api';
import { Button, Input, Select } from '../../../components/ui';
import styles from '../components/admin-page.module.css';

const schema = z.object({
  type: z.enum(['STOCK_IN', 'STOCK_OUT', 'DAMAGE', 'ADJUSTMENT']),
  variantId: z.string().uuid('Must be a valid variant ID'),
  branchId: z.string().uuid('Select a branch'),
  quantity: z.coerce.number().int(),
  reference: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function RecordMovementForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => identityApi.listBranches({ limit: 100 }),
  });

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { type: 'STOCK_IN' } });

  const type = watch('type');

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const idempotencyKey = crypto.randomUUID();
      if (values.type === 'STOCK_IN') {
        return productInventoryApi.stockIn({ ...values, idempotencyKey });
      }
      if (values.type === 'STOCK_OUT') {
        return productInventoryApi.stockOut({ ...values, idempotencyKey });
      }
      if (values.type === 'DAMAGE') {
        return productInventoryApi.markDamaged({ ...values, idempotencyKey });
      }
      return productInventoryApi.adjustStock({
        variantId: values.variantId,
        branchId: values.branchId,
        quantityDelta: values.quantity,
        reference: values.reference,
        idempotencyKey,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-balances'] });
      onDone();
    },
  });

  const quantityLabel = type === 'ADJUSTMENT' ? 'Quantity Delta (can be negative)' : 'Quantity';

  return (
    <form className={styles.form} onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {mutation.isError && (
        <div className={styles.banner} role="alert">
          Could not record this movement. Check the variant ID and try again.
        </div>
      )}
      <Select label="Movement Type" error={errors.type?.message} {...register('type')}>
        <option value="STOCK_IN">Stock In</option>
        <option value="STOCK_OUT">Stock Out</option>
        <option value="DAMAGE">Mark Damaged</option>
        <option value="ADJUSTMENT">Adjustment</option>
      </Select>
      <Input
        label="Variant ID"
        placeholder="UUID of the product variant"
        error={errors.variantId?.message}
        {...register('variantId')}
      />
      <Select label="Branch" error={errors.branchId?.message} {...register('branchId')}>
        <option value="">Select a branch…</option>
        {branches?.data.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Input
        label={quantityLabel}
        type="number"
        error={errors.quantity?.message}
        {...register('quantity')}
      />
      <Input label="Reference (optional)" error={errors.reference?.message} {...register('reference')} />
      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Record Movement
        </Button>
      </div>
    </form>
  );
}
