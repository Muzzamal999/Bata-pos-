'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { identityApi, productInventoryApi } from '../../../lib/api';
import { Button, Input, Select } from '../../../components/ui';
import styles from '../components/admin-page.module.css';

const schema = z.object({
  branchId: z.string().uuid('Select a branch'),
  supplierReference: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateReceiptForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => identityApi.listBranches({ limit: 100 }),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => productInventoryApi.createReceipt(values),
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      onDone();
      router.push(`/receiving/${receipt.id}`);
    },
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {mutation.isError && (
        <div className={styles.banner} role="alert">
          Could not create the receipt. Please try again.
        </div>
      )}
      <Select label="Receiving Branch" error={errors.branchId?.message} {...register('branchId')}>
        <option value="">Select…</option>
        {branches?.data.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Input
        label="Supplier Reference (optional)"
        placeholder="PO-2026-0042"
        error={errors.supplierReference?.message}
        {...register('supplierReference')}
      />
      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Create Receipt
        </Button>
      </div>
    </form>
  );
}
