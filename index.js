import DHT from 'hyperdht'
import fs from 'fs'
import goodbye from 'graceful-goodbye'

const node = new DHT()
const server = node.createServer()

goodbye(() => server.close())

server.on('connection', socket => {
  socket.setKeepAlive(5000)
  socket.on('error', err => console.error(err))
  console.log(`Got connection from ${socket.remotePublicKey.toString('hex')}`)

  socket.on('data', async data => {
    try {
      socket.pause()
      await writeToLogFile({
        json: JSON.parse(data),
        logFilename: `${socket.remotePublicKey.toString('hex')}.log`
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
  const timestamp = new Date().toISOString()
  json.time = timestamp
  const logEntry = JSON.stringify(json)

  return fs.promises.appendFile(logFilename, `${logEntry}\n`)

  // Leaving this here, in case we might need the labels part again
  // const labels = flatten(json, { delimiter: '_' }) // Turn `{ object: { id: 1 } }` into `{ object_id: 1 }`
  // Object.keys(labels).forEach(key => { labels[key] = '' + labels[key] }) // All values have to be strings for loki
  // delete labels.caller_props_signal_description_sdp
  // delete labels.object_props_signal_description_sdp
}

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
