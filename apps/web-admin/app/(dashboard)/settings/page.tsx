'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { Role } from '@bata-pos/shared-types';
import { identityApi } from '../../../lib/api';
import { useCurrentUser } from '../../../lib/use-current-user';
import { useThemeStore } from '../../../lib/theme-store';
import { useHasPermission } from '../../../lib/permissions';
import { Badge, Button, Card, Modal, Table } from '../../../components/ui';
import { CreateRoleForm } from './create-role-form';
import styles from '../components/admin-page.module.css';

export default function SettingsPage() {
  const { data: user } = useCurrentUser();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const [isCreateRoleOpen, setCreateRoleOpen] = useState(false);
  const queryClient = useQueryClient();
  const canReadRoles = useHasPermission('roles.read');
  const canCreateRole = useHasPermission('roles.create');
  const canDeleteRole = useHasPermission('roles.delete');

  const { data: roles, isLoading, error } = useQuery({
    queryKey: ['roles'],
    queryFn: () => identityApi.listRoles({ limit: 100 }),
    enabled: canReadRoles,
  });

  const deleteRole = useMutation({
    mutationFn: (role: Role) => identityApi.deleteRole(role.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });

  return (
    <div>
      <div className={styles.header}>
        <div>
          <p className={styles.title}>Settings</p>
          <p className={styles.subtitle}>Your account, appearance, and role configuration.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Card title="Account">
          {user ? (
            <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span>
                <strong>{user.firstName} {user.lastName}</strong>
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>{user.email}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {user.tenantId ? 'Tenant-scoped account' : 'Platform-level account'}
              </span>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Loading…</p>
          )}
        </Card>

        <Card title="Appearance">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Currently using {theme === 'dark' ? 'dark' : 'light'} theme
            </span>
            <Button size="sm" variant="secondary" onClick={toggleTheme}>
              Switch to {theme === 'dark' ? 'light' : 'dark'}
            </Button>
          </div>
        </Card>
      </div>

      {canReadRoles && (
        <>
          <div className={styles.header}>
            <div>
              <p className={styles.title} style={{ fontSize: 16 }}>Roles</p>
              <p className={styles.subtitle}>Roles available to assign to users.</p>
            </div>
            {canCreateRole && <Button onClick={() => setCreateRoleOpen(true)}>Add Role</Button>}
          </div>

          <Card>
            <Table<Role>
              columns={[
                { key: 'name', header: 'Name', render: (r) => r.name },
                { key: 'description', header: 'Description', render: (r) => r.description ?? '—' },
                {
                  key: 'type',
                  header: 'Type',
                  render: (r) => (
                    <Badge variant={r.isSystem ? 'info' : 'neutral'}>{r.isSystem ? 'System' : 'Custom'}</Badge>
                  ),
                },
                ...(canDeleteRole
                  ? [
                      {
                        key: 'actions',
                        header: '',
                        render: (r: Role) =>
                          !r.isSystem && (
                            <Button
                              size="sm"
                              variant="danger"
                              loading={deleteRole.isPending && deleteRole.variables?.id === r.id}
                              onClick={() => deleteRole.mutate(r)}
                            >
                              Delete
                            </Button>
                          ),
                      },
                    ]
                  : []),
              ]}
              data={roles?.data}
              rowKey={(r) => r.id}
              isLoading={isLoading}
              error={
                error
                  ? isAxiosError(error) && !error.response
                    ? 'Cannot reach the Identity service. Is it running?'
                    : 'Failed to load roles.'
                  : null
              }
              emptyMessage="No roles yet."
            />
          </Card>

          {isCreateRoleOpen && (
            <Modal title="Add Role" onClose={() => setCreateRoleOpen(false)}>
              <CreateRoleForm onDone={() => setCreateRoleOpen(false)} />
            </Modal>
          )}
        </>
      )}
    </div>
  );
}
