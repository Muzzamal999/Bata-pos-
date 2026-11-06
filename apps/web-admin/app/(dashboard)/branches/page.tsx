'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { Branch } from '@bata-pos/shared-types';
import { identityApi } from '../../../lib/api';
import { useHasPermission } from '../../../lib/permissions';
import { Badge, Button, Card, Table } from '../../../components/ui';
import { Modal } from '../../../components/ui';
import { RequirePermission } from '../../../components/require-permission';
import { CreateBranchForm } from './create-branch-form';
import styles from '../components/admin-page.module.css';

export default function BranchesPage() {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const canRead = useHasPermission('branches.read');
  const canCreate = useHasPermission('branches.create');
  const canActivate = useHasPermission('branches.activate');
  const canDeactivate = useHasPermission('branches.deactivate');
  const canToggle = canActivate || canDeactivate;

  const { data, isLoading, error } = useQuery({
    queryKey: ['branches'],
    queryFn: () => identityApi.listBranches({ limit: 100 }),
    enabled: canRead,
  });

  const toggleActive = useMutation({
    mutationFn: (branch: Branch) =>
      branch.isActive ? identityApi.deactivateBranch(branch.id) : identityApi.activateBranch(branch.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branches'] }),
  });

  return (
    <RequirePermission permission="branches.read">
      <div>
        <div className={styles.header}>
          <div>
            <p className={styles.title}>Branches</p>
            <p className={styles.subtitle}>Manage the physical store locations in your organization.</p>
          </div>
          {canCreate && <Button onClick={() => setCreateOpen(true)}>Add Branch</Button>}
        </div>

        <Card>
          <Table<Branch>
            columns={[
              { key: 'name', header: 'Name', render: (b) => b.name },
              { key: 'code', header: 'Code', render: (b) => b.code },
              { key: 'address', header: 'Address', render: (b) => b.address ?? '—' },
              {
                key: 'status',
                header: 'Status',
                render: (b) => (
                  <Badge variant={b.isActive ? 'success' : 'neutral'}>{b.isActive ? 'Active' : 'Inactive'}</Badge>
                ),
              },
              ...(canToggle
                ? [
                    {
                      key: 'actions',
                      header: '',
                      render: (b: Branch) => (
                        <div className={styles.rowActions}>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={toggleActive.isPending && toggleActive.variables?.id === b.id}
                            onClick={() => toggleActive.mutate(b)}
                          >
                            {b.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
            data={data?.data}
            rowKey={(b) => b.id}
            isLoading={isLoading}
            error={
              error
                ? isAxiosError(error) && !error.response
                  ? 'Cannot reach the Identity service. Is it running?'
                  : 'Failed to load branches.'
                : null
            }
            emptyMessage="No branches yet. Create your first branch to get started."
          />
        </Card>

        {isCreateOpen && (
          <Modal title="Add Branch" onClose={() => setCreateOpen(false)}>
            <CreateBranchForm onDone={() => setCreateOpen(false)} />
          </Modal>
        )}
      </div>
    </RequirePermission>
  );
}
