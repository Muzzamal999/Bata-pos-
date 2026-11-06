'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { Price, ProductVariant } from '@bata-pos/shared-types';
import { productInventoryApi } from '../../../../lib/api';
import { useHasPermission } from '../../../../lib/permissions';
import { Badge, Button, Card, Input, Modal, Table } from '../../../../components/ui';
import { RequirePermission } from '../../../../components/require-permission';
import { CreateVariantForm } from './create-variant-form';
import { CreatePriceForm } from './create-price-form';
import adminStyles from '../../components/admin-page.module.css';
import styles from './page.module.css';

const barcodeSchema = z.object({ code: z.string().min(4, 'Must be at least 4 characters') });
type BarcodeFormValues = z.infer<typeof barcodeSchema>;

function AddBarcodeInline({ variantId }: { variantId: string }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<BarcodeFormValues>({
    resolver: zodResolver(barcodeSchema),
  });

  const mutation = useMutation({
    mutationFn: (values: BarcodeFormValues) => productInventoryApi.addBarcode(variantId, values.code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['variants'] });
      reset();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginTop: 6 }}
    >
      <Input placeholder="Scan or type barcode" error={errors.code?.message} {...register('code')} />
      <Button type="submit" size="sm" variant="secondary" loading={isSubmitting || mutation.isPending}>
        Add
      </Button>
    </form>
  );
}

export default function ProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = use(params);
  const [isVariantOpen, setVariantOpen] = useState(false);
  const [isPriceOpen, setPriceOpen] = useState(false);
  const queryClient = useQueryClient();

  const canReadVariants = useHasPermission('variants.read');
  const canCreateVariant = useHasPermission('variants.create');
  const canActivateVariant = useHasPermission('variants.activate');
  const canDeactivateVariant = useHasPermission('variants.deactivate');
  const canToggleVariant = canActivateVariant || canDeactivateVariant;
  const canCreateBarcode = useHasPermission('barcodes.create');
  const canDeleteBarcode = useHasPermission('barcodes.delete');
  const canReadPricing = useHasPermission('pricing.read');
  const canCreatePricing = useHasPermission('pricing.create');

  const { data: product, error: productError } = useQuery({
    queryKey: ['product', productId],
    queryFn: () => productInventoryApi.getProduct(productId),
  });

  const { data: variants, isLoading: variantsLoading, error: variantsError } = useQuery({
    queryKey: ['variants', productId],
    queryFn: () => productInventoryApi.listVariants(productId),
    enabled: canReadVariants,
  });

  const { data: prices, isLoading: pricesLoading, error: pricesError } = useQuery({
    queryKey: ['prices', productId],
    queryFn: () => productInventoryApi.listPrices({ productId, limit: 100 }),
    enabled: canReadPricing,
  });

  const toggleVariant = useMutation({
    mutationFn: (variant: ProductVariant) =>
      variant.isActive
        ? productInventoryApi.deactivateVariant(variant.id)
        : productInventoryApi.activateVariant(variant.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['variants', productId] }),
  });

  const removeBarcode = useMutation({
    mutationFn: ({ variantId, barcodeId }: { variantId: string; barcodeId: string }) =>
      productInventoryApi.removeBarcode(variantId, barcodeId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['variants', productId] }),
  });

  return (
    <RequirePermission permission="products.read">
      <div>
        <Link href="/products" className={styles.backLink}>
          ← Back to Product Catalogue
        </Link>

        {productError ? (
          <p style={{ color: 'var(--color-danger)' }}>Could not load this product.</p>
        ) : (
          <div className={adminStyles.header}>
            <div>
              <p className={adminStyles.title}>{product?.name ?? 'Loading…'}</p>
              <p className={adminStyles.subtitle}>{product?.articleNumber}</p>
            </div>
            {product && <Badge variant={product.isActive ? 'success' : 'neutral'}>{product.isActive ? 'Active' : 'Inactive'}</Badge>}
          </div>
        )}

        {canReadVariants && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionTitle}>Variants</p>
              {canCreateVariant && <Button size="sm" onClick={() => setVariantOpen(true)}>Add Variant</Button>}
            </div>
            <Card>
              <Table<ProductVariant>
                columns={[
                  { key: 'size', header: 'Size', render: (v) => v.size },
                  { key: 'color', header: 'Color', render: (v) => v.color },
                  { key: 'sku', header: 'SKU', render: (v) => v.sku },
                  {
                    key: 'barcodes',
                    header: 'Barcodes',
                    render: (v) => (
                      <div>
                        <div className={styles.barcodeRow}>
                          {v.barcodes.map((b) => (
                            <span key={b.id} className={styles.barcodeChip}>
                              {b.code}
                              {canDeleteBarcode && (
                                <button
                                  type="button"
                                  className={styles.chipRemove}
                                  aria-label={`Remove barcode ${b.code}`}
                                  onClick={() => removeBarcode.mutate({ variantId: v.id, barcodeId: b.id })}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                        {canCreateBarcode && <AddBarcodeInline variantId={v.id} />}
                      </div>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (v) => <Badge variant={v.isActive ? 'success' : 'neutral'}>{v.isActive ? 'Active' : 'Inactive'}</Badge>,
                  },
                  ...(canToggleVariant
                    ? [
                        {
                          key: 'actions',
                          header: '',
                          render: (v: ProductVariant) => (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={toggleVariant.isPending && toggleVariant.variables?.id === v.id}
                              onClick={() => toggleVariant.mutate(v)}
                            >
                              {v.isActive ? 'Deactivate' : 'Activate'}
                            </Button>
                          ),
                        },
                      ]
                    : []),
                ]}
                data={variants?.data}
                rowKey={(v) => v.id}
                isLoading={variantsLoading}
                error={
                  variantsError
                    ? isAxiosError(variantsError) && !variantsError.response
                      ? 'Cannot reach the Product & Inventory service. Is it running?'
                      : 'Failed to load variants.'
                    : null
                }
                emptyMessage="No variants yet. Add a size/color combination to get started."
              />
            </Card>
          </div>
        )}

        {canReadPricing && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <p className={styles.sectionTitle}>Pricing</p>
              {canCreatePricing && <Button size="sm" onClick={() => setPriceOpen(true)}>Set Price</Button>}
            </div>
            <Card>
              <Table<Price>
                columns={[
                  {
                    key: 'scope',
                    header: 'Applies To',
                    render: (p) => (p.variantId ? `Variant ${p.variantId.slice(0, 8)}…` : 'Whole product'),
                  },
                  { key: 'branch', header: 'Branch', render: (p) => (p.branchId ? `${p.branchId.slice(0, 8)}…` : 'Tenant-wide') },
                  { key: 'amount', header: 'Amount', render: (p) => `${p.amount} ${p.currency}` },
                  {
                    key: 'effective',
                    header: 'Effective From',
                    render: (p) => new Date(p.effectiveFrom).toLocaleDateString(),
                  },
                ]}
                data={prices?.data}
                rowKey={(p) => p.id}
                isLoading={pricesLoading}
                error={
                  pricesError
                    ? isAxiosError(pricesError) && !pricesError.response
                      ? 'Cannot reach the Product & Inventory service. Is it running?'
                      : 'Failed to load prices.'
                    : null
                }
                emptyMessage="No prices set yet."
              />
            </Card>
          </div>
        )}

        {isVariantOpen && (
          <Modal title="Add Variant" onClose={() => setVariantOpen(false)}>
            <CreateVariantForm productId={productId} onDone={() => setVariantOpen(false)} />
          </Modal>
        )}

        {isPriceOpen && (
          <Modal title="Set Price" onClose={() => setPriceOpen(false)}>
            <CreatePriceForm productId={productId} variants={variants?.data ?? []} onDone={() => setPriceOpen(false)} />
          </Modal>
        )}
      </div>
    </RequirePermission>
  );
}
