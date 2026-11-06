'use client';

import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { identityApi, productInventoryApi } from '../../../lib/api';
import { Button, Input, Select } from '../../../components/ui';
import styles from '../components/admin-page.module.css';

const schema = z.object({
  sourceBranchId: z.string().uuid('Select a source branch'),
  destinationBranchId: z.string().uuid('Select a destination branch'),
  notes: z.string().optional(),
  lines: z
    .array(
      z.object({
        variantId: z.string().uuid('Must be a valid variant ID'),
        requestedQty: z.coerce.number().int().positive('Must be greater than 0'),
      }),
    )
    .min(1, 'Add at least one line'),
});

type FormValues = z.infer<typeof schema>;

export function CreateTransferForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: () => identityApi.listBranches({ limit: 100 }),
  });

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { lines: [{ variantId: '', requestedQty: 1 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => productInventoryApi.createTransfer(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      onDone();
    },
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {mutation.isError && (
        <div className={styles.banner} role="alert">
          Could not create the transfer. Please check the fields and try again.
        </div>
      )}
      <Select label="Source Branch" error={errors.sourceBranchId?.message} {...register('sourceBranchId')}>
        <option value="">Select…</option>
        {branches?.data.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Select
        label="Destination Branch"
        error={errors.destinationBranchId?.message}
        {...register('destinationBranchId')}
      >
        <option value="">Select…</option>
        {branches?.data.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Input label="Notes (optional)" {...register('notes')} />

      <div>
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Lines</p>
        {fields.map((field, index) => (
          <div key={field.id} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 2 }}>
              <Input
                placeholder="Variant ID"
                error={errors.lines?.[index]?.variantId?.message}
                {...register(`lines.${index}.variantId`)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                type="number"
                placeholder="Qty"
                error={errors.lines?.[index]?.requestedQty?.message}
                {...register(`lines.${index}.requestedQty`)}
              />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fields.length === 1}>
              Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={() => append({ variantId: '', requestedQty: 1 })}>
          + Add Line
        </Button>
      </div>

      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Create Transfer
        </Button>
      </div>
    </form>
  );
}
