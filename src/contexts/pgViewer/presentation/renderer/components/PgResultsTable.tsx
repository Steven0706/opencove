import type { JSX } from 'react'
import type { PgQueryResult } from '../../../../../shared/contracts/dto'

interface PgResultsTableProps {
  results: PgQueryResult | null
}

export function PgResultsTable({ results }: PgResultsTableProps): JSX.Element | null {
  if (!results) {
    return null
  }

  return (
    <div className="pg-viewer-node__results nowheel nodrag">
      <div className="pg-viewer-node__results-meta">
        {results.rowCount} row{results.rowCount === 1 ? '' : 's'}
        {results.truncated ? ' (truncated)' : ''}
      </div>
      <div className="pg-viewer-node__results-scroll">
        <table className="pg-viewer-node__results-table">
          <thead>
            <tr>
              {results.columns.map(col => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => (
                  <td key={colIndex}>{cell === null ? 'NULL' : String(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
