import { ReactNode } from 'react';
import styles from './table.module.css';

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[] | undefined;
  rowKey: (row: T) => string;
  isLoading?: boolean;
  error?: string | null;
  emptyMessage?: string;
}

export function Table<T>({
  columns,
  data,
  rowKey,
  isLoading,
  error,
  emptyMessage = 'No records found.',
}: TableProps<T>) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td className={styles.statusCell} colSpan={columns.length}>
                Loading…
              </td>
            </tr>
          )}
          {!isLoading && error && (
            <tr>
              <td className={`${styles.statusCell} ${styles.errorCell}`} colSpan={columns.length} role="alert">
                {error}
              </td>
            </tr>
          )}
          {!isLoading && !error && (!data || data.length === 0) && (
            <tr>
              <td className={styles.statusCell} colSpan={columns.length}>
                {emptyMessage}
              </td>
            </tr>
          )}
          {!isLoading &&
            !error &&
            data?.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td key={col.key}>{col.render(row)}</td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
