'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { Product } from '@bata-pos/shared-types';
import { productInventoryApi } from '../../../lib/api';
import { useHasPermission } from '../../../lib/permissions';
import { Badge, Button, Card, Input, LinkButton, Modal, Table } from '../../../components/ui';
import { RequirePermission } from '../../../components/require-permission';
import { CreateProductForm } from './create-product-form';
import styles from '../components/admin-page.module.css';

export default function ProductsPage() {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();
  const canRead = useHasPermission('products.read');
  const canCreate = useHasPermission('products.create');
  const canActivate = useHasPermission('products.activate');
  const canDeactivate = useHasPermission('products.deactivate');
  const canToggle = canActivate || canDeactivate;

  const { data, isLoading, error } = useQuery({
    queryKey: ['products', search],
    queryFn: () => productInventoryApi.listProducts({ limit: 100, search: search || undefined }),
    enabled: canRead,
  });
  const { data: brands } = useQuery({
    queryKey: ['brands'],
    queryFn: () => productInventoryApi.listBrands({ limit: 100 }),
  });
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => productInventoryApi.listCategories({ limit: 100 }),
  });

  const brandNames = useMemo(
    () => new Map(brands?.data.map((b) => [b.id, b.name]) ?? []),
    [brands],
  );
  const categoryNames = useMemo(
    () => new Map(categories?.data.map((c) => [c.id, c.name]) ?? []),
    [categories],
  );

  const toggleActive = useMutation({
    mutationFn: (product: Product) =>
      product.isActive
        ? productInventoryApi.deactivateProduct(product.id)
        : productInventoryApi.activateProduct(product.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  return (
    <RequirePermission permission="products.read">
      <div>
      <div className={styles.header}>
        <div>
          <p className={styles.title}>Product Catalogue</p>
          <p className={styles.subtitle}>Manage products, brands and categories.</p>
        </div>
        {canCreate && <Button onClick={() => setCreateOpen(true)}>Add Product</Button>}
      </div>

      <div style={{ marginBottom: 16, maxWidth: 320 }}>
        <Input
          placeholder="Search by name or article number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <Table<Product>
          columns={[
            { key: 'articleNumber', header: 'Article #', render: (p) => p.articleNumber },
            { key: 'name', header: 'Name', render: (p) => p.name },
            { key: 'brand', header: 'Brand', render: (p) => (p.brandId ? brandNames.get(p.brandId) ?? '—' : '—') },
            {
              key: 'category',
              header: 'Category',
              render: (p) => (p.categoryId ? categoryNames.get(p.categoryId) ?? '—' : '—'),
            },
            {
              key: 'status',
              header: 'Status',
              render: (p) => (
                <Badge variant={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Active' : 'Inactive'}</Badge>
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (p: Product) => (
                <div className={styles.rowActions}>
                  <LinkButton href={`/products/${p.id}`} size="sm" variant="secondary">
                    Manage
                  </LinkButton>
                  {canToggle && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={toggleActive.isPending && toggleActive.variables?.id === p.id}
                      onClick={() => toggleActive.mutate(p)}
                    >
                      {p.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
          data={data?.data}
          rowKey={(p) => p.id}
          isLoading={isLoading}
          error={
            error
              ? isAxiosError(error) && !error.response
                ? 'Cannot reach the Product & Inventory service. Is it running?'
                : 'Failed to load products.'
              : null
          }
          emptyMessage={search ? 'No products match your search.' : 'No products yet. Add your first product.'}
        />
      </Card>

      {isCreateOpen && (
        <Modal title="Add Product" onClose={() => setCreateOpen(false)}>
          <CreateProductForm onDone={() => setCreateOpen(false)} />
        </Modal>
      )}
      </div>
    </RequirePermission>
  );
}
