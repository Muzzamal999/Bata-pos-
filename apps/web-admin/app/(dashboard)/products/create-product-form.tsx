'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { productInventoryApi } from '../../../lib/api';
import { Button, Input, Select } from '../../../components/ui';
import styles from '../components/admin-page.module.css';

const schema = z.object({
  articleNumber: z.string().min(1, 'Article number is required'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  brandId: z.string().optional(),
  categoryId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateProductForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: () => productInventoryApi.listBrands({ limit: 100 }),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => productInventoryApi.listCategories({ limit: 100 }),
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      productInventoryApi.createProduct({
        ...values,
        brandId: values.brandId || undefined,
        categoryId: values.categoryId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onDone();
    },
    onError: (error) => {
      if (isAxiosError(error) && error.response?.status === 409) {
        setError('articleNumber', { message: 'A product with this article number already exists' });
      }
    },
  });

  return (
    <form className={styles.form} onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      {mutation.isError && !(isAxiosError(mutation.error) && mutation.error.response?.status === 409) && (
        <div className={styles.banner} role="alert">
          Could not create the product. Please try again.
        </div>
      )}
      <Input
        label="Article Number"
        placeholder="BATA-OX-001"
        error={errors.articleNumber?.message}
        {...register('articleNumber')}
      />
      <Input label="Name" placeholder="Men's Leather Oxford" error={errors.name?.message} {...register('name')} />
      <Input label="Description (optional)" error={errors.description?.message} {...register('description')} />
      <Select label="Brand (optional)" error={errors.brandId?.message} {...register('brandId')}>
        <option value="">No brand</option>
        {brands?.data.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>
      <Select label="Category (optional)" error={errors.categoryId?.message} {...register('categoryId')}>
        <option value="">No category</option>
        {categories?.data.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting || mutation.isPending}>
          Create Product
        </Button>
      </div>
    </form>
  );
}
