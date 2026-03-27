import { Pool } from 'pg'
import type {
  PgConnectInput,
  PgConnectResult,
  PgListTablesResult,
  PgQueryResult,
} from '../../../shared/contracts/dto'

export class PgConnectionManager {
  private pools: Map<string, Pool> = new Map()

  async connect(input: PgConnectInput): Promise<PgConnectResult> {
    const connectionId = crypto.randomUUID()

    const pool = new Pool({
      host: input.host,
      port: input.port,
      database: input.database,
      user: input.user,
      password: input.password,
    })

    // Test the connection
    const client = await pool.connect()
    try {
      await client.query('SELECT 1')
    } finally {
      client.release()
    }

    this.pools.set(connectionId, pool)

    const { tables } = await this.listTables(connectionId)

    return { connectionId, tables }
  }

  async disconnect(connectionId: string): Promise<void> {
    const pool = this.pools.get(connectionId)
    if (!pool) {
      return
    }

    await pool.end()
    this.pools.delete(connectionId)
  }

  async listTables(connectionId: string): Promise<PgListTablesResult> {
    const pool = this.pools.get(connectionId)
    if (!pool) {
      throw new Error(`No connection found for id: ${connectionId}`)
    }

    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    )

    const tables = result.rows.map(
      (row: Record<string, unknown>) => row.table_name as string,
    )

    return { tables }
  }

  async query(connectionId: string, sql: string, maxRows: number = 500): Promise<PgQueryResult> {
    const pool = this.pools.get(connectionId)
    if (!pool) {
      throw new Error(`No connection found for id: ${connectionId}`)
    }

    const client = await pool.connect()
    try {
      await client.query('SET statement_timeout = 30000')

      const result = await client.query(sql)

      const columns = (result.fields ?? []).map(field => field.name)
      const allRows = result.rows as Record<string, unknown>[]
      const truncated = allRows.length > maxRows
      const slicedRows = truncated ? allRows.slice(0, maxRows) : allRows

      const rows = slicedRows.map(row => columns.map(col => row[col]))

      return {
        columns,
        rows,
        rowCount: allRows.length,
        truncated,
      }
    } finally {
      client.release()
    }
  }

  async disposeAll(): Promise<void> {
    const entries = [...this.pools.entries()]
    this.pools.clear()

    await Promise.allSettled(entries.map(([, pool]) => pool.end()))
  }
}
