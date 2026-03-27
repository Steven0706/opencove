import { useState } from 'react'
import type { JSX } from 'react'
import type { PgConnectResult } from '../../../../../shared/contracts/dto'

interface PgConnectionFormProps {
  host: string
  port: number
  database: string
  user: string
  onConnect: (result: PgConnectResult, password: string) => void
}

export function PgConnectionForm({
  host: initialHost,
  port: initialPort,
  database: initialDatabase,
  user: initialUser,
  onConnect,
}: PgConnectionFormProps): JSX.Element {
  const [host, setHost] = useState(initialHost || 'localhost')
  const [port, setPort] = useState(initialPort || 5432)
  const [database, setDatabase] = useState(initialDatabase)
  const [user, setUser] = useState(initialUser)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setIsConnecting(true)

    try {
      const result = await window.opencoveApi.pg.connect({
        host,
        port,
        database,
        user,
        password,
      })
      onConnect(result, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <form
      className="pg-viewer-node__form"
      onSubmit={event => {
        void handleSubmit(event)
      }}
    >
      <label className="pg-viewer-node__field">
        <span className="pg-viewer-node__field-label">Host</span>
        <input
          type="text"
          className="pg-viewer-node__input nodrag"
          value={host}
          onChange={event => setHost(event.target.value)}
          placeholder="localhost"
        />
      </label>
      <label className="pg-viewer-node__field">
        <span className="pg-viewer-node__field-label">Port</span>
        <input
          type="number"
          className="pg-viewer-node__input nodrag"
          value={port}
          onChange={event => setPort(Number(event.target.value))}
          placeholder="5432"
        />
      </label>
      <label className="pg-viewer-node__field">
        <span className="pg-viewer-node__field-label">Database</span>
        <input
          type="text"
          className="pg-viewer-node__input nodrag"
          value={database}
          onChange={event => setDatabase(event.target.value)}
          placeholder="mydb"
        />
      </label>
      <label className="pg-viewer-node__field">
        <span className="pg-viewer-node__field-label">User</span>
        <input
          type="text"
          className="pg-viewer-node__input nodrag"
          value={user}
          onChange={event => setUser(event.target.value)}
          placeholder="postgres"
        />
      </label>
      <label className="pg-viewer-node__field">
        <span className="pg-viewer-node__field-label">Password</span>
        <input
          type="password"
          className="pg-viewer-node__input nodrag"
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder=""
        />
      </label>
      {error ? <div className="pg-viewer-node__error">{error}</div> : null}
      <button
        type="submit"
        className="pg-viewer-node__connect-btn nodrag"
        disabled={isConnecting || !database || !user}
      >
        {isConnecting ? 'Connecting...' : 'Connect'}
      </button>
    </form>
  )
}
