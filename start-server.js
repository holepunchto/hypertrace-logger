const { Server } = require('./index')
const fs = require('fs')
const goodbye = require('graceful-goodbye')
const DHT = require('hyperdht')

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

  const server = new Server({ folder: './' })
  await server.listen(keyPair)
  console.log(`server started on ${keyPair.publicKey.toString('hex')}`)

  goodbye(() => server.close())
}
