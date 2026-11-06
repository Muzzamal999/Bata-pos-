'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import type { CashMovement, Shift } from '@bata-pos/shared-types';
import { identityApi, salesPosApi } from '../../../lib/api';
import { useAuthStore } from '../../../lib/auth-store';
import { CashMovementModal } from '../components/cash-movement-modal';
import { CloseShiftModal } from '../components/close-shift-modal';
import styles from './shift.module.css';

function money(amount: string | number): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return `PKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDuration(openedAt: string, until: Date): string {
  const ms = Math.max(0, until.getTime() - new Date(openedAt).getTime());
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

const EMPTY_PERMISSIONS: string[] = [];

export default function ShiftPage() {
  const queryClient = useQueryClient();
  const branchId = useAuthStore((s) => s.selectedBranchId);
  // Select the user object itself (a stable reference), not a derived array -
  // see Phase 7's fix for why `?? []` here would cause an infinite loop.
  const authUser = useAuthStore((s) => s.user);
  const permissions = authUser?.permissions ?? EMPTY_PERMISSIONS;
  const [openingFloat, setOpeningFloat] = useState('');
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [showCashMovement, setShowCashMovement] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [closedShift, setClosedShift] = useState<Shift | null>(null);
  const [now, setNow] = useState(() => new Date());

  const { data: branch } = useQuery({
    queryKey: ['branch', branchId],
    queryFn: () => identityApi.getBranch(branchId!),
    enabled: Boolean(branchId),
    retry: false,
  });

  const { data: currentShift, isLoading: loadingShift } = useQuery({
    queryKey: ['current-shift'],
    queryFn: () => salesPosApi.getCurrentShift(),
    retry: false,
  });

  useEffect(() => {
    if (!currentShift) return;
    // Refresh immediately: `now` may have been captured at mount, before this
    // shift existed, which would otherwise show a negative duration until the
    // first 30s tick.
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(interval);
  }, [currentShift]);

  const openShift = useMutation({
    mutationFn: () => {
      if (!branchId) throw new Error('No branch selected for this session.');
      return salesPosApi.openShift({ branchId, openingFloat: Number(openingFloat) });
    },
    onSuccess: () => {
      setMovements([]);
      setClosedShift(null);
      setOpeningFloat('');
      queryClient.invalidateQueries({ queryKey: ['current-shift'] });
    },
  });

  const cashInTotal = movements.filter((m) => m.type === 'CASH_IN').reduce((sum, m) => sum + Number(m.amount), 0);
  const cashOutTotal = movements.filter((m) => m.type === 'CASH_OUT').reduce((sum, m) => sum + Number(m.amount), 0);

  function handleMovementRecorded(movement: CashMovement) {
    setMovements((prev) => [movement, ...prev]);
  }

  function handleShiftClosed(shift: Shift) {
    setClosedShift(shift);
    queryClient.invalidateQueries({ queryKey: ['current-shift'] });
  }

  function handleStartNewShift() {
    setClosedShift(null);
    setMovements([]);
  }

  if (!permissions.includes('shifts.read')) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Shift Management</h1>
        <p className={styles.subtitle}>Your account doesn&apos;t have permission to manage shifts.</p>
      </div>
    );
  }

  if (loadingShift) {
    return (
      <div className={styles.page}>
        <p className={styles.subtitle}>Loading shift status…</p>
      </div>
    );
  }

  // --- Closed-shift report (just closed this session) ---
  if (closedShift) {
    const variance = Number(closedShift.variance ?? 0);
    const varianceClass = variance > 0 ? styles.varianceOver : variance < 0 ? styles.varianceShort : styles.varianceExact;
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Shift Report</h1>
        <p className={styles.subtitle}>This shift has been closed. Here is the final summary.</p>
        <div className={styles.card}>
          <div className={styles.reportRow}>
            <span>Opened</span>
            <span>{new Date(closedShift.openedAt).toLocaleString()}</span>
          </div>
          <div className={styles.reportRow}>
            <span>Closed</span>
            <span>{closedShift.closedAt ? new Date(closedShift.closedAt).toLocaleString() : '—'}</span>
          </div>
          <div className={styles.reportRow}>
            <span>Opening float</span>
            <span>{money(closedShift.openingFloat)}</span>
          </div>

          <div className={styles.sectionTitle}>This Session&apos;s Cash Movements</div>
          <div className={styles.reportRow}>
            <span>Cash in</span>
            <span>{money(cashInTotal)}</span>
          </div>
          <div className={styles.reportRow}>
            <span>Cash out</span>
            <span>{money(cashOutTotal)}</span>
          </div>

          <div className={styles.sectionTitle}>Drawer Reconciliation</div>
          <div className={styles.reportRow}>
            <span>Expected cash (server-calculated)</span>
            <span className={styles.reportRowStrong}>{money(closedShift.expectedCash ?? '0')}</span>
          </div>
          <div className={styles.reportRow}>
            <span>Counted cash</span>
            <span className={styles.reportRowStrong}>{money(closedShift.closingCash ?? '0')}</span>
          </div>
          <div className={styles.reportRow}>
            <span>Discrepancy</span>
            <span className={`${styles.reportRowStrong} ${varianceClass}`}>
              {money(Math.abs(variance))} {variance > 0 ? '(over)' : variance < 0 ? '(short)' : '(exact)'}
            </span>
          </div>

          <button type="button" className={styles.primaryButton} style={{ marginTop: 20 }} onClick={handleStartNewShift}>
            Start New Shift
          </button>
        </div>
      </div>
    );
  }

  // --- No active shift: opening form ---
  if (!currentShift) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Open Shift</h1>
        <p className={styles.subtitle}>Start your shift by entering the starting cash float in the drawer.</p>
        <div className={styles.card}>
          {openShift.isError && (
            <div className={styles.errorBanner} role="alert">
              {isAxiosError(openShift.error) && openShift.error.response?.status === 409
                ? 'You already have an open shift.'
                : isAxiosError(openShift.error) && !openShift.error.response
                  ? 'Cannot reach the Sales & POS service. Is it running?'
                  : isAxiosError(openShift.error)
                    ? String((openShift.error.response?.data as { message?: string } | undefined)?.message ?? 'Failed to open shift.')
                    : (openShift.error as Error).message}
            </div>
          )}
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Branch</span>
            <div className={styles.fieldStatic}>{branch ? `${branch.code} - ${branch.name}` : 'Loading…'}</div>
          </div>
          <div className={styles.field}>
            <label htmlFor="opening-float" className={styles.fieldLabel}>
              Opening Cash Float
            </label>
            <input
              id="opening-float"
              type="number"
              min={0}
              className={styles.fieldInput}
              placeholder="0.00"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={
              !permissions.includes('shifts.open') ||
              !branchId ||
              openingFloat === '' ||
              Number(openingFloat) < 0 ||
              openShift.isPending
            }
            title={!permissions.includes('shifts.open') ? "You don't have permission to open a shift" : undefined}
            onClick={() => openShift.mutate()}
          >
            {openShift.isPending ? 'Opening…' : 'Open Shift'}
          </button>
        </div>
      </div>
    );
  }

  // --- Active shift dashboard ---
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Active Shift</h1>
      <div className={styles.card}>
        <div className={styles.dashboardHeader}>
          <span className={styles.fieldLabel} style={{ marginBottom: 0 }}>
            Opened {new Date(currentShift.openedAt).toLocaleString()}
          </span>
        </div>
        <div className={styles.dashboardMeta}>
          {branch ? `${branch.code} - ${branch.name}` : ''} · Duration {formatDuration(currentShift.openedAt, now)}
        </div>

        <div className={styles.statGrid}>
          <div className={styles.statTile}>
            <div className={styles.statLabel}>Opening Float</div>
            <div className={styles.statValue}>{money(currentShift.openingFloat)}</div>
          </div>
          <div className={styles.statTile}>
            <div className={styles.statLabel}>Cash In (this session)</div>
            <div className={styles.statValue}>{money(cashInTotal)}</div>
          </div>
          <div className={styles.statTile}>
            <div className={styles.statLabel}>Cash Out (this session)</div>
            <div className={styles.statValue}>{money(cashOutTotal)}</div>
          </div>
          <div className={styles.statTile}>
            <div className={styles.statLabel}>Running Drawer Estimate</div>
            <div className={styles.statValue}>{money(Number(currentShift.openingFloat) + cashInTotal - cashOutTotal)}</div>
          </div>
        </div>

        <p className={styles.disclosureNote}>
          Cash, card and wallet sales totals and the official expected cash balance are calculated
          by the server only when you close the shift - there is no live sales breakdown endpoint.
          The running drawer estimate above only reflects this session&apos;s opening float and
          cash in/out; it does not include sales.
        </p>

        <div className={styles.actionRow}>
          <button
            type="button"
            className={styles.actionButton}
            disabled={!permissions.includes('shifts.open')}
            title={!permissions.includes('shifts.open') ? "You don't have permission to record cash movements" : undefined}
            onClick={() => setShowCashMovement(true)}
          >
            Cash In / Cash Out
          </button>
        </div>

        <div className={styles.sectionTitle}>This Session&apos;s Cash Movements</div>
        <AnimatePresence initial={false}>
          {movements.length === 0 ? (
            <p className={styles.emptyMovements}>
              No cash movements recorded yet this session. (History resets on refresh - there is no
              backend list endpoint to restore it from.)
            </p>
          ) : (
            movements.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={styles.movementRow}
              >
                <span className={m.type === 'CASH_IN' ? styles.movementIn : styles.movementOut}>
                  {m.type === 'CASH_IN' ? '+ ' : '− '}
                  {money(m.amount)} {m.reason ? `— ${m.reason}` : ''}
                </span>
                <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
              </motion.div>
            ))
          )}
        </AnimatePresence>

        <button
          type="button"
          className={styles.closeButton}
          style={{ marginTop: 20 }}
          disabled={!permissions.includes('shifts.close')}
          title={!permissions.includes('shifts.close') ? "You don't have permission to close a shift" : undefined}
          onClick={() => setShowCloseShift(true)}
        >
          Close Shift
        </button>
      </div>

      {showCashMovement && (
        <CashMovementModal
          shiftId={currentShift.id}
          onClose={() => setShowCashMovement(false)}
          onSuccess={handleMovementRecorded}
        />
      )}
      {showCloseShift && (
        <CloseShiftModal shiftId={currentShift.id} onClose={() => setShowCloseShift(false)} onSuccess={handleShiftClosed} />
      )}
    </div>
  );
}
