import { pool } from './pool.js';
/** Create monthly check_results partitions for this month and the next `monthsAhead`. */
export async function ensurePartitions(monthsAhead = 2) {
    const now = new Date();
    for (let i = 0; i <= monthsAhead; i++) {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
        const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
        const name = `check_results_y${start.getUTCFullYear()}m${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
        await pool.query(`CREATE TABLE IF NOT EXISTS ${name} PARTITION OF check_results
       FOR VALUES FROM ('${start.toISOString()}') TO ('${end.toISOString()}')`);
    }
}
//# sourceMappingURL=partitions.js.map