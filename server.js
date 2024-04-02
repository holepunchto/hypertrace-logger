const DHT = require('hyperdht')
const fs = require('fs')
const path = require('path')

const DEBUG = true

module.exports = class Server {
  constructor ({ folder }) {
    this.userCount = 0
    this.folder = folder
    this.server = new DHT().createServer()

    const sessions = new Map()

    this.server.on('connection', async socket => {
      this.userCount += 1
      const swarmId = socket.remotePublicKey.toString('hex')
      const swarmIdShort = swarmId.slice(0, 8)
      const generatedUserId = `User-${this.userCount}`
      let userId = generatedUserId
      console.log(`[NOTE] Got connection from ${swarmIdShort}. Full swarmId: ${swarmId}`)

      // Upsert session
      sessions.set(swarmId, sessions.get(swarmId) || {
        lastSeenTraceSessionId: null,
        lastSeenTraceNumber: null
      })
      const lastSeenSession = sessions.get(swarmId)

      // Send handshake
      socket.write(JSON.stringify(lastSeenSession))

      socket.setKeepAlive(5000)
      socket.on('error', err => {
        this._writeToLogFile({
          swarmId,
          json: {
            note: `Socket error. code=${err.code} message=${err.message}`
          }
        })
      })
      socket.on('data', async data => {
        try {
          socket.pause()
          data = JSON.parse(data)
          userId = (data.props?.username || data.props?.alias || generatedUserId).replace(/[^\x00-\x7F]/g, '').replaceAll(' ', '_') + `___${swarmIdShort}` // eslint-disable-line no-control-regex

          const session = sessions.get(swarmId)
          const isSameSession = session.lastSeenTraceSessionId === data.traceSessionId
          const isNextTraceNumber = (session.lastSeenTraceNumber + 1) === data.traceNumber
          if (!isSameSession) {
            const note = `New session from ${swarmId}. sessionId=${data.traceSessionId}`
            console.log(`[${new Date().toISOString()}] [NOTE] [${userId}] ${note}`)
            await this._writeToLogFile({
              swarmId,
              json: { note }
            })
          }
          if (isSameSession && !isNextTraceNumber) {
            const note = `Skipped ${data.traceNumber - session.lastSeenTraceNumber - 1} messages! lastSeenTraceNumber=${session.lastSeenTraceNumber} traceNumber=${data.traceNumber}`
            console.warn(`[${new Date().toISOString()}] [WARNING] [${userId}] ${note}`)
            await this._writeToLogFile({
              swarmId,
              json: { note }
            })
          }

          session.lastSeenTraceSessionId = data.traceSessionId
          session.lastSeenTraceNumber = data.traceNumber

          await this._writeToLogFile({
            swarmId,
            json: {
              userId,
              ...data
            }
          })
        } catch (err) {
          console.error(err?.config?.data || err)
        } finally {
          socket.resume()
        }
      })
    })
  }

  async listen (keyPair) {
    return await this.server.listen(keyPair)
  }

  async _writeToLogFile ({ json, swarmId }) {
    json = {
      time: new Date().toISOString(),
      ...json
    }

    const logFilename = path.join(this.folder, `${swarmId}.log`)
    const logEntry = JSON.stringify(json)

    if (DEBUG) {
      const { caller, id, object, note, traceNumber, time, userId } = json

      if (note) {
        console.log(`[${time}] [${swarmId}] [NOTE] ${note}`)
      } else {
        console.log(`[${time}] [${userId}] [#${traceNumber}]${id ? ` [${id}] ` : ' '}${object.className}@${caller.functionName}`)
      }
    }

    // The file here is formatted to be picked up by promtail
    return fs.promises.appendFile(logFilename, `${logEntry}\n`)
  }

  close () {
    return this.server.close()
  }
}
