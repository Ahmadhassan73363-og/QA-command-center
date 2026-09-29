import { pool } from './pool.js';

const RETENTION_DAYS = 7;

const partitionName = (d: Date) =>
  `check_results_y${d.getUTCFullYear()}m${String(d.getUTCMonth() + 1).padStart(2, '0')}d${String(d.getUTCDate()).padStart(2, '0')}`;

/** Create daily check_results partitions for today and the next `daysAhead` days. */
export async function ensurePartitions(daysAhead = 5): Promise<void> {
  const now = new Date();
  for (let i = 0; i <= daysAhead; i++) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + i));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 1));
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${partitionName(start)} PARTITION OF check_results
       FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')`,
    );
  }
}

export interface RotationResult {
  droppedPartitions: string[];
  deletedRuns: number;
}

/**
 * Drops check_results partitions wholly older than `retentionDays`, then purges runs rows that
 * no longer have any check_results referencing them (runs.id has no ON DELETE CASCADE from
 * check_results, so a run can't be deleted while a check_results row still points at it —
 * dropping the partition first removes that reference, making the delete safe).
 */
export async function rotateOldData(retentionDays = RETENTION_DAYS): Promise<RotationResult> {
  const { rows } = await pool.query<{ name: string; bound: string }>(`
    SELECT child.relname AS name, pg_get_expr(child.relpartbound, child.oid) AS bound
    FROM pg_inherits
    JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
    JOIN pg_class child ON pg_inherits.inhrelid = child.oid
    WHERE parent.relname = 'check_results'
  `);

  const cutoff = Date.now() - retentionDays * 86_400_000;
  const droppedPartitions: string[] = [];
  for (const row of rows) {
    if (row.bound === 'DEFAULT') continue;
    const match = row.bound.match(/TO \('([^']+)'\)/);
    if (!match) continue;
    const upperBound = new Date(match[1]).getTime();
    if (upperBound <= cutoff) {
      await pool.query(`DROP TABLE IF EXISTS ${row.name}`);
      droppedPartitions.push(row.name);
    }
  }

  const { rowCount } = await pool.query(
    `DELETE FROM runs r WHERE r.started_at < $1 AND NOT EXISTS (SELECT 1 FROM check_results c WHERE c.run_id = r.id)`,
    [new Date(cutoff).toISOString()],
  );

  return { droppedPartitions, deletedRuns: rowCount ?? 0 };
}
