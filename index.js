import DHT from 'hyperdht'
import fs from 'fs'

const node = new DHT()
const server = node.createServer()
let logFilename = 'tmp.log'

server.on('connection', socket => {
  socket.on('error', err => console.error(err))
  console.log('got connection')

  socket.on('data', async data => {
    try {
      socket.pause()
      await sendDataToLoki(JSON.parse(data))
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

  logFilename = `${kp.publicKey}.log`
  await server.listen(keyPair)
  console.log(`server started on ${keyPair.publicKey.toString('hex')}`)
}

async function sendDataToLoki (json) {
  const logEntry = JSON.stringify(json)
  const timestamp = new Date().toISOString()

  return fs.promises.appendFile(logFilename, `${timestamp} ${logEntry}\n`)

  // Leaving this here, in case we might need the labels part again
  // const labels = flatten(json, { delimiter: '_' }) // Turn `{ object: { id: 1 } }` into `{ object_id: 1 }`
  // Object.keys(labels).forEach(key => { labels[key] = '' + labels[key] }) // All values have to be strings for loki
  // delete labels.caller_props_signal_description_sdp
  // delete labels.object_props_signal_description_sdp
}

// sendDataToLoki({
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

