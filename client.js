const hypertrace = require('hypertrace')
const { EventEmitter } = require('events')

const { setTraceFunction, clearTraceFunction } = hypertrace

module.exports = class Client extends EventEmitter {
  constructor () {
    super()
    this._props = null
    this._tracingStream = null
    this._connected = false
    this._lastConnectionError = null
    this._traceMessagesCount = 0
    this._traceSessionId = Math.random().toString().slice(2)
  }

  _createStream ({ createSocket }) {
    const socket = createSocket()
    socket.setKeepAlive(5000)

    return socket
  }

  async start ({ createSocket, canSocketReconnect = () => true, ignoreClassNames = [], getInitialProps = () => { } } = {}) {
    if (this._tracingStream) return console.warn('[hypertrace-logger] Cannot start tracing, as tracing is already running')
    const buffer = []

    // Note: Call setTraceFunction() as early as possible
    setTraceFunction(params => {
      const { id, object, parentObject, caller } = params
      const shouldIgnore = ignoreClassNames.find(ignoreClassName => ignoreClassName === object?.className || ignoreClassName === parentObject?.className)
      if (shouldIgnore) return

      const traceNumber = this._traceMessagesCount
      this._traceMessagesCount += 1

      const res = {
        traceTimestamp: new Date().toISOString(),
        traceSessionId: this._traceSessionId,
        traceNumber,
        id,
        props: this._props,
        object: {
          id: object.id,
          className: object.className,
          props: object.props
        },
        caller: {
          filename: caller.filename,
          functionName: caller.functionName,
          props: caller.props
        }
      }

      let jsonString

      try {
        jsonString = JSON.stringify(res, jsonStringifyReplacer)
      } catch (err) {
        console.warn('[hypertrace-logger] Error in tracing (error has been suppresed)', err)
        return
      }

      if (buffer.length > 2048) buffer.splice(0, 1024)
      buffer.push({ traceNumber, jsonString })

      this._tracingStream?.write(jsonString)
    })

    const initialProps = await getInitialProps()
    if (initialProps) this.addProps(initialProps)

    let tracingStream = this._createStream({ createSocket, getInitialProps })

    const onOpen = () => {
      this._connected = true
      this.emit('open')
    }
    const onHandshake = data => {
      const { lastSeenTraceSessionId, lastSeenTraceNumber } = JSON.parse(data)
      const isSameSession = lastSeenTraceSessionId === this._traceSessionId
      const serverMessagesSeen = isSameSession
        ? lastSeenTraceNumber + 1
        : 0

      buffer.forEach(({ traceNumber, jsonString }) => {
        if (traceNumber < serverMessagesSeen) return
        tracingStream.write(jsonString)
      })

      this._tracingStream = tracingStream
    }
    const onClose = async () => {
      this._connected = false
      this._tracingStream = null

      if (!canSocketReconnect()) {
        this.emit('close')
        return
      }

      this.emit('reconnect')

      const waitTime = Math.floor(10000 + Math.random() * 5000)
      await new Promise(resolve => setTimeout(resolve, waitTime))

      tracingStream = this._createStream({ createSocket, getInitialProps, backoff: true })
      tracingStream.once('data', onHandshake)
      tracingStream.on('open', onOpen)
      tracingStream.on('error', onConnectionError)
      tracingStream.on('close', onClose)
    }
    const onConnectionError = err => {
      this._lastConnectionError = err
      this.emit('connection-error', err)
    }

    tracingStream.once('data', onHandshake)
    tracingStream.on('open', onOpen)
    tracingStream.on('error', onConnectionError)
    tracingStream.on('close', onClose)
  }

  stop () {
    clearTraceFunction()
    this._tracingStream?.destroy()
    this._tracingStream = null
  }

  isRunning () {
    return this._connected
  }

  getLastConnectionError () {
    return this._lastConnectionError
  }

  addProps ({ ...props }) {
    this._props = this._props
      ? { ...this._props, ...props }
      : { ...props }
  }
}

function jsonStringifyReplacer (k, v) {
  const isError = v instanceof Error
  const isBuffer = v?.type === 'Buffer'

  if (isBuffer) return Buffer.from(v.data).toString('hex')
  if (isError) return { code: v.code, message: v.message }

  // Note: These next lines should be removed when udx-native v1.8.8 lands in platform. It's replaced with a .toJSON() on UDXStreams.
  const isUdxStream = v?.pipe && typeof v?.id === 'number' && typeof v?.remoteId === 'number'
  if (isUdxStream) {
    return {
      id: v.id,
      connected: v.connected,
      destroying: v.destroying,
      destroyed: v.destroyed,
      remoteId: v.remoteId,
      remoteHost: v.remoteHost,
      remoteFamily: v.remoteFamily,
      remotePort: v.remotePort,
      mtu: v.mtu,
      rtt: v.rtt,
      cwnd: v.cwnd
    }
  }

  return v
}
