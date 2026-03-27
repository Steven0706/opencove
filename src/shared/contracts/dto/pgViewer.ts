export interface PgConnectInput {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export interface PgConnectResult {
  connectionId: string
  tables: string[]
}

export interface PgDisconnectInput {
  connectionId: string
}

export interface PgListTablesInput {
  connectionId: string
}

export interface PgListTablesResult {
  tables: string[]
}

export interface PgQueryInput {
  connectionId: string
  query: string
  maxRows?: number
}

export interface PgQueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
}
