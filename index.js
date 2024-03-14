import DHT from 'hyperdht'
import fs from 'fs'
import goodbye from 'graceful-goodbye'
import Grapher from './grapher.js'

const node = new DHT()
const server = node.createServer()
const grapher = new Grapher()
const sessions = new Map()

goodbye(() => server.close())

let userCount = 0
server.on('connection', async socket => {
  userCount += 1
  const swarmId = socket.remotePublicKey.toString('hex')
  const swarmIdShort = swarmId.slice(0, 8)
  const generatedUserId = `User-${userCount}`
  const logFilename = `${swarmId}.log`
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

  // Clean up older connections
  grapher.clearConnections(swarmId)

  await writeToLogFile({
    logFilename,
    json: {
      time: new Date().toISOString(),
      tracingConnectionEnabled: true
    }
  })

  socket.setKeepAlive(5000)
  socket.on('error', async err => {
    console.error(`[${new Date().toISOString()}] [${userId}]`, err)

    await writeToLogFile({
      logFilename,
      json: {
        time: new Date().toISOString(),
        userId,
        tracingConnectionEnabled: false,
        reason: err?.code || err?.message
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
        await writeToLogFile({
          logFilename,
          json: { time: new Date().toISOString(), note }
        })
      }
      if (isSameSession && !isNextTraceNumber) {
        const note = `Skipped ${data.traceNumber - session.lastSeenTraceNumber - 1} messages! lastSeenTraceNumber=${session.lastSeenTraceNumber} traceNumber=${data.traceNumber}`
        console.warn(`[${new Date().toISOString()}] [WARNING] [${userId}] ${note}`)
        await writeToLogFile({
          logFilename,
          json: { time: new Date().toISOString(), note }
        })
      }

      session.lastSeenTraceSessionId = data.traceSessionId
      session.lastSeenTraceNumber = data.traceNumber

      const json = {
        time: new Date().toISOString(),
        userId,
        ...data
      }

      grapher.add(json)

      await writeToLogFile({
        json,
        logFilename: `${swarmId}.log`
      })
    } catch (err) {
      console.error(err?.config?.data || err)
    } finally {
      socket.resume()
    }
  })
})

main()

async function main () {
  const doesKeysExists = fs.existsSync('./keys.dat')
  if (!doesKeysExists) {
    const kp = DHT.keyPair()
    fs.writeFileSync('./keys.dat', JSON.stringify({
      publicKey: kp.publicKey.toString('hex'),
      secretKey: kp.secretKey.toString('hex')
    }))
  }

  const kp = JSON.parse(fs.readFileSync('./keys.dat'))
  const keyPair = {
    publicKey: Buffer.from(kp.publicKey, 'hex'),
    secretKey: Buffer.from(kp.secretKey, 'hex')
  }

  await server.listen(keyPair)
  console.log(`server started on ${keyPair.publicKey.toString('hex')}`)
}

async function writeToLogFile ({ json, logFilename }) {
  const logEntry = JSON.stringify(json)

  return fs.promises.appendFile(logFilename, `${logEntry}\n`)

  // Leaving this here, in case we might need the labels part again
  // const labels = flatten(json, { delimiter: '_' }) // Turn `{ object: { id: 1 } }` into `{ object_id: 1 }`
  // Object.keys(labels).forEach(key => { labels[key] = '' + labels[key] }) // All values have to be strings for loki
  // delete labels.caller_props_signal_description_sdp
  // delete labels.object_props_signal_description_sdp
}
