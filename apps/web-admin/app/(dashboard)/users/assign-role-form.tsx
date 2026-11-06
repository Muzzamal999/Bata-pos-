'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@bata-pos/shared-types';
import { identityApi } from '../../../lib/api';
import { Button, Select } from '../../../components/ui';
import styles from '../components/admin-page.module.css';

export function AssignRoleForm({ user, onDone }: { user: User; onDone: () => void }) {
  const [roleId, setRoleId] = useState('');
  const queryClient = useQueryClient();

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => identityApi.listRoles({ limit: 100 }),
  });

  const mutation = useMutation({
    mutationFn: () => identityApi.assignUserRole(user.id, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      onDone();
    },
  });

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (roleId) mutation.mutate();
      }}
    >
      {mutation.isError && (
        <div className={styles.banner} role="alert">
          Could not assign that role. Please try again.
        </div>
      )}
      <Select
        label="Role"
        value={roleId}
        onChange={(e) => setRoleId(e.target.value)}
        disabled={isLoading}
        required
      >
        <option value="">Select a role…</option>
        {roles?.data.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </Select>
      <div className={styles.formActions}>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={mutation.isPending} disabled={!roleId}>
          Assign Role
        </Button>
      </div>
    </form>
  );
}
