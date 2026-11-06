'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductVariant } from '@bata-pos/shared-types';
import { identityApi, productInventoryApi } from '../../../../lib/api';
import { Button, Input, Select } from '../../../../components/ui';
import styles from '../../components/admin-page.module.css';

const schema = z.object({
  variantId: z.string().optional(),
  branchId: z.string().optional(),
  amount: z.coerce.number().positive('Must be greater than 0'),
  currency: z.string().length(3, 'Use a 3-letter currency code').optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreatePriceForm({
  productId,
  variants,
  onDone,
}: {
  productId: string;
  variants: ProductVariant[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => identityApi.listBranches({ limit: 100 }),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { currency: 'PKR' } });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      productInventoryApi.createPrice({
        productId: values.variantId ? undefined : productId,
        variantId: values.variantId || undefined,
        branchId: values.branchId || undefined,
        amount: values.amount,
        currency: values.currency,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prices', productId] });
      onDone();
    },
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {mutation.isError && (
        <div className={styles.banner} role="alert">
          Could not create the price. Please try again.
        </div>
      )}
      <Select
        label="Applies To"
        hint="Leave as 'Whole product' for a price covering every variant."
        {...register('variantId')}
      >
        <option value="">Whole product (all variants)</option>
        {variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.size} / {v.color} ({v.sku})
          </option>
        ))}
      </Select>
      <Select label="Branch (optional)" {...register('branchId')}>
        <option value="">Tenant-wide default</option>
        {branches?.data.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Input label="Amount" type="number" step="0.01" error={errors.amount?.message} {...register('amount')} />
      <Input label="Currency" error={errors.currency?.message} {...register('currency')} />
      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Set Price
        </Button>
      </div>
    </form>
  );
}
