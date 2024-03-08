import DHT from 'hyperdht'
import fs from 'fs'
import goodbye from 'graceful-goodbye'
import Grapher from './grapher.js'

console.log('Check for startup issues', 1)
const node = new DHT()
console.log('Check for startup issues', 2)
const server = node.createServer()
console.log('Check for startup issues', 3)
const grapher = new Grapher()
console.log('Check for startup issues', 4)

goodbye(() => server.close())

let userCount = 0
server.on('connection', async socket => {
  userCount += 1
  const swarmId = socket.remotePublicKey.toString('hex')
  const swarmIdShort = swarmId.slice(0, 8)
  const generatedUserId = `User-${userCount}`
  let userId = generatedUserId
  console.log(`Got connection from ${swarmIdShort}. Full swarmId: ${swarmId}`)

  // Clean up older connections
  grapher.clearConnections(swarmId)

  await writeToLogFile({
    json: {
      time: new Date().toISOString(),
      tracingConnectionEnabled: true
    },
    logFilename: `${swarmId}.log`
  })

  socket.setKeepAlive(5000)
  socket.on('error', async err => {
    console.error(`[${new Date().toISOString()}] [${userId}]`, err)

    await writeToLogFile({
      json: {
        time: new Date().toISOString(),
        userId,
        tracingConnectionEnabled: false,
        reason: err?.code || err?.message
      },
      logFilename: `${swarmId}.log`
    })
  })
  socket.on('data', async data => {
    try {
      socket.pause()
      data = JSON.parse(data)
      userId = (data.props?.username || data.props?.alias || generatedUserId).replace(/[^\x00-\x7F]/g, '').replaceAll(' ', '_') + `___${swarmIdShort}` // eslint-disable-line no-control-regex
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
  console.log('Check for startup issues', 5)
  const doesKeysExists = fs.existsSync('./keys.dat')
  if (!doesKeysExists) {
    const kp = DHT.keyPair()
    fs.writeFileSync('./keys.dat', JSON.stringify({
      publicKey: kp.publicKey.toString('hex'),
      secretKey: kp.secretKey.toString('hex')
    }))
  }

  console.log('Check for startup issues', 6)
  const kp = JSON.parse(fs.readFileSync('./keys.dat'))
  const keyPair = {
    publicKey: Buffer.from(kp.publicKey, 'hex'),
    secretKey: Buffer.from(kp.secretKey, 'hex')
  }
  console.log('Check for startup issues', 7)
  await server.listen(keyPair)
  console.log(`server started on ${keyPair.publicKey.toString('hex')}`)
}

async function writeToLogFile ({ json, logFilename }) {
  const logEntry = JSON.stringify(json)
  // console.log('[stored]', logEntry)
  // const logEntry = JSON.stringify(json)

  return fs.promises.appendFile(logFilename, `${logEntry}\n`)

  // Leaving this here, in case we might need the labels part again
  // const labels = flatten(json, { delimiter: '_' }) // Turn `{ object: { id: 1 } }` into `{ object_id: 1 }`
  // Object.keys(labels).forEach(key => { labels[key] = '' + labels[key] }) // All values have to be strings for loki
  // delete labels.caller_props_signal_description_sdp
  // delete labels.object_props_signal_description_sdp
}

// A simple serializer whose main responsibility is to turn buffers into hex-strings
// function serializeJsonWithBuffers (obj) {
//   return JSON.stringify(serializeNoStringify(obj))

//   function serializeNoStringify (obj) {
//     if (obj === null) return obj
//     if (Buffer.isBuffer(obj)) return obj.toString('hex')
//     if (Array.isArray(obj)) return obj.map(v => serializeNoStringify(v))
//     if (typeof obj !== 'object') return obj
//     return Object.entries(obj).reduce((serializedObj, [key, val]) => {
//       serializedObj[key] = serializeNoStringify(val)
//       return serializedObj
//     }, {})
//   }
// }

// writeToLogFile({
//   "caller": {
//     "functionName": "_observeSignalEvents",
//     "props": {
//       "swarmId": "4mhsoa8riyxu7ozwnsfrbhyj3nqxbbb94h4bgsa84y46ybh4a11y",
//       "signal": {
//         "description": {
//           "type": "answer",
//           "sdp": "v=0\r\no=- 507648..."
//         }
//       }
//     }
//   },
//   "id": "null",
//   "object": {
//     "id": "1",
//     "className": "KeetCall",
//     "props": {
//       "swarmId": "4mhsoa8riyxu7ozwnsfrbhyj3nqxbbb94h4bgsa84y46ybh4a11y",
//       "signal": {
//         "description": {
//           "type": "answer",
//           "sdp": "v=0\r\no=- 507648..."
//         }
//       }
//     }
//   }
// })
