import type { JSX } from 'react'

interface PgTableListProps {
  tables: string[]
  activeTable: string | null
  onSelectTable: (tableName: string) => void
}

export function PgTableList({
  tables,
  activeTable,
  onSelectTable,
}: PgTableListProps): JSX.Element {
  return (
    <div className="pg-viewer-node__tables nowheel nodrag">
      <div className="pg-viewer-node__tables-header">Tables</div>
      <div className="pg-viewer-node__tables-list">
        {tables.map(table => (
          <button
            key={table}
            type="button"
            className={`pg-viewer-node__table-item ${
              activeTable === table ? 'pg-viewer-node__table-item--active' : ''
            }`}
            onClick={() => onSelectTable(table)}
          >
            {table}
          </button>
        ))}
        {tables.length === 0 ? (
          <div className="pg-viewer-node__tables-empty">No tables found</div>
        ) : null}
      </div>
    </div>
  )
}
