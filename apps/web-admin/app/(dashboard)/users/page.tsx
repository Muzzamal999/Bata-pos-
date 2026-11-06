'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { User } from '@bata-pos/shared-types';
import { identityApi } from '../../../lib/api';
import { useHasPermission } from '../../../lib/permissions';
import { Badge, Button, Card, Modal, Table } from '../../../components/ui';
import { RequirePermission } from '../../../components/require-permission';
import { CreateUserForm } from './create-user-form';
import { AssignRoleForm } from './assign-role-form';
import styles from '../components/admin-page.module.css';

export default function UsersPage() {
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const queryClient = useQueryClient();
  const canRead = useHasPermission('users.read');
  const canCreate = useHasPermission('users.create');
  const canActivate = useHasPermission('users.activate');
  const canDeactivate = useHasPermission('users.deactivate');
  const canAssignRole = useHasPermission('users.assign_role');
  const canToggle = canActivate || canDeactivate;

  const { data, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: () => identityApi.listUsers({ limit: 100 }),
    enabled: canRead,
  });

  const toggleActive = useMutation({
    mutationFn: (user: User) =>
      user.isActive ? identityApi.deactivateUser(user.id) : identityApi.activateUser(user.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <RequirePermission permission="users.read">
      <div>
        <div className={styles.header}>
          <div>
            <p className={styles.title}>Users</p>
            <p className={styles.subtitle}>Manage accounts, access, and role assignments.</p>
          </div>
          {canCreate && <Button onClick={() => setCreateOpen(true)}>Add User</Button>}
        </div>

        <Card>
          <Table<User>
            columns={[
              { key: 'name', header: 'Name', render: (u) => `${u.firstName} ${u.lastName}` },
              { key: 'email', header: 'Email', render: (u) => u.email },
              {
                key: 'status',
                header: 'Status',
                render: (u) => (
                  <Badge variant={u.isActive ? 'success' : 'neutral'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
                ),
              },
              ...(canAssignRole || canToggle
                ? [
                    {
                      key: 'actions',
                      header: '',
                      render: (u: User) => (
                        <div className={styles.rowActions}>
                          {canAssignRole && (
                            <Button size="sm" variant="secondary" onClick={() => setRoleTarget(u)}>
                              Assign Role
                            </Button>
                          )}
                          {canToggle && (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={toggleActive.isPending && toggleActive.variables?.id === u.id}
                              onClick={() => toggleActive.mutate(u)}
                            >
                              {u.isActive ? 'Deactivate' : 'Activate'}
                            </Button>
                          )}
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
            data={data?.data}
            rowKey={(u) => u.id}
            isLoading={isLoading}
            error={
              error
                ? isAxiosError(error) && !error.response
                  ? 'Cannot reach the Identity service. Is it running?'
                  : 'Failed to load users.'
                : null
            }
            emptyMessage="No users yet. Create the first account to get started."
          />
        </Card>

        {isCreateOpen && (
          <Modal title="Add User" onClose={() => setCreateOpen(false)}>
            <CreateUserForm onDone={() => setCreateOpen(false)} />
          </Modal>
        )}

        {roleTarget && (
          <Modal
            title={`Assign Role — ${roleTarget.firstName} ${roleTarget.lastName}`}
            onClose={() => setRoleTarget(null)}
          >
            <AssignRoleForm user={roleTarget} onDone={() => setRoleTarget(null)} />
          </Modal>
        )}
      </div>
    </RequirePermission>
  );
}
