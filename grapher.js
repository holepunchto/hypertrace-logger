#!/usr/bin/env node
import fs from 'fs'
import imgcat from 'imgcat'
import { spawn } from 'child_process'

const isRunThroughCli = import.meta.url === `file://${process.argv[1]}`

class Grapher {
  usersPublicKeysConnections = {} // { userId => { publicKey => [remotePublicKeys] } }
  publicKeyToUser = {} // { publicKey => userId }
  usersConnections = {} // { userId => [userId] }
  nextImgNumber = 0
  generatingImage = false
  generateImageQueue = []
  lastGeneratedScriptWithoutTitle = null

  constructor () {
    fs.mkdirSync('images', { recursive: true })
  }

  clearConnections (swarmId) {
    delete this.publicKeyToUser[swarmId]
    // this.drawDiagram()
  }

  add ({ props, caller, id, object, tracingConnectionEnabled, traceNumber, time, userId }) {
    /*
      !!!Note!!!
      Not sure this is still the case, but leaving the comment here:
      Sometimes a `listening` entry will come after a stream-open/close entry that references it.
      This means that publicKeyToUser[publicKey] is not set, and it won't be logged.
    */
    console.log(`[${time}] [${userId}] [#${traceNumber}] [${id}] ${object.className}@${caller.functionName}`)

    if (tracingConnectionEnabled !== undefined) {
      console.log(`[${time}] [${userId}] [#${traceNumber}] Tracing ${tracingConnectionEnabled ? 'enabled' : 'disable'}`)
    }

    if (id === 'listen') {
      const { publicKey } = caller.props
      this.publicKeyToUser[publicKey] = userId
      // console.log(`[${time}] [${userId}] [LISTEN] ${publicKey} -> ${userId}`)
    }

    if (id === 'stream-open') {
      const { publicKey, remotePublicKey } = caller.props.stream
      // console.log(`[${time}] [${userId}] [OPEN] ${remotePublicKey} -> ${publicKey}`)
      const fromUser = this.publicKeyToUser[publicKey]
      const toUser = this.publicKeyToUser[remotePublicKey]
      const shouldFilterOut = !fromUser || !toUser
      if (shouldFilterOut) return

      this.usersConnections[fromUser] = this.usersConnections[fromUser] || []
      this.usersConnections[fromUser].push(toUser)
      this.drawDiagram(time)

      this.usersPublicKeysConnections[userId] = this.usersPublicKeysConnections[userId] || { connections: {} }
      this.usersPublicKeysConnections[userId].connections[publicKey] = this.usersPublicKeysConnections[userId].connections[publicKey] || []
      this.usersPublicKeysConnections[userId].connections[publicKey].push(remotePublicKey)
      console.log(`[${time}] [${userId}] [#${traceNumber}] Stream opened. ${fromUser} (${this.totalConnections(fromUser)} conns) => ${toUser} (${this.totalConnections(toUser)} conns)`)
    }

    if (id === 'stream-close') {
      const { publicKey, remotePublicKey } = caller.props.stream
      // console.log(`[${time}] [${userId}] [CLOSE] ${remotePublicKey} -> ${publicKey}`)
      const { code } = caller.props.error || {}
      const fromUser = this.publicKeyToUser[publicKey]
      const toUser = this.publicKeyToUser[remotePublicKey]
      const shouldFilterOut = !fromUser || !toUser
      if (shouldFilterOut) return

      this.usersConnections[fromUser] = this.usersConnections[fromUser]?.filter(u => u !== toUser)
      if (!this.usersConnections[fromUser]?.length) delete this.usersConnections[fromUser]
      this.drawDiagram(time)

      if (this.usersPublicKeysConnections[userId]) {
        this.usersPublicKeysConnections[userId].connections[publicKey] = this.usersPublicKeysConnections[userId].connections[publicKey].filter(k => k !== remotePublicKey)
      }

      console.log(`[${time}] [${userId}] [#${traceNumber}] Stream closed. ${fromUser} (${this.totalConnections(fromUser)} conns) x> ${toUser} (${this.totalConnections(toUser)} conns), reason=${code || null}`)
    }
  }

  totalConnections (userId) {
    if (!this.usersPublicKeysConnections[userId]) return 0
    return Object.entries(this.usersPublicKeysConnections[userId].connections).reduce((totalCount, [publicKey, connections]) => totalCount + connections.length, 0)
  }

  drawDiagram (time) {
    this.nextImgNumber += 1

    const writtenConnections = []
    let connectionsString = Object.entries(this.usersConnections)
      .sort(([fromUserA], [fromUserB]) => fromUserA.localeCompare(fromUserB)) // Sorting helps generating a more stable image
      .map(([fromUser, connections]) => connections
        .map(toUser => {
          const isBothWays = this.usersConnections[toUser]?.includes(fromUser)
          const isAlreadyWritten = isBothWays
            ? writtenConnections.includes(`${fromUser} --- ${toUser}`) || writtenConnections.includes(`${toUser} --- ${fromUser}`)
            : writtenConnections.includes(`${fromUser} --> ${toUser}`)

          const connectionStr = isAlreadyWritten
            ? null
            : isBothWays
              ? `${fromUser} --- ${toUser}`
              : `${fromUser} --> ${toUser}`
          writtenConnections.push(connectionStr)
          return connectionStr
        })
        .filter(str => !!str)
        .join(';')
      )
      .filter(str => !!str)
      .join(';')
    connectionsString += ';'

    // Find those users who do not have a connection between each other
    Object.keys(this.usersConnections)
      .forEach(fromUser => {
        const missingConnectionsBetweenThisUserAndOthers = Object.keys(this.usersConnections)
          .filter(toUser => fromUser !== toUser)
          .filter(toUser => !(
            writtenConnections.includes(`${toUser} --> ${fromUser}`) ||
            writtenConnections.includes(`${fromUser} --> ${toUser}`) ||
            writtenConnections.includes(`${toUser} --- ${fromUser}`) ||
            writtenConnections.includes(`${fromUser} --- ${toUser}`)
          ))
        missingConnectionsBetweenThisUserAndOthers.forEach(toUser => {
          const isAlreadyWritten = connectionsString.includes(`${toUser} -.- ${fromUser}`)
          if (!isAlreadyWritten) connectionsString += `${fromUser} -.- ${toUser};`
        })
      })

    // Sort connectionsString to make keep the generated image more stable
    connectionsString = connectionsString.trim().split(';').slice(0, -1).sort((a, b) => a.localeCompare(b)).join(';')

    // Find the indexes of the --- arrows
    const linkstylesBothDirections = connectionsString
      .split(';').map((str, i) => str.includes(' --- ')
        ? i
        : null
      )
      .filter(str => str !== null)

    // Find the indexes of the --> arrows
    const linkStylesOneDirection = connectionsString
      .split(';').map((str, i) => str.includes(' --> ')
        ? i
        : null
      )
      .filter(str => str !== null)

    // Find the indexes of the -.- arrows
    const linkStylesMissingConnection = connectionsString
      .split(';').map((str, i) => str.includes(' -.- ')
        ? i
        : null
      )
      .filter(str => str !== null)

    // Error: ENOENT: no such file or directory, open 'img-0012-2024-03-05T10.29.03.507Z.png'

    const script = [
      '---',
      `title: ${time}`,
      '---',
      'flowchart TD',
      `${connectionsString};`,
      linkstylesBothDirections.length > 0
        ? `linkStyle ${linkstylesBothDirections.join(',')} stroke:green;`
        : '',
      linkStylesOneDirection.length > 0
        ? `linkStyle ${linkStylesOneDirection.join(',')} stroke:yellow;`
        : '',
      linkStylesMissingConnection.length > 0
        ? `linkStyle ${linkStylesMissingConnection.join(',')} stroke:red;`
        : ''
    ].join('\n')
    this.generateImageQueue.push({
      filename: `images/img-${this.nextImgNumber.toString().padStart(4, '0')}-${time.replaceAll(':', '.')}.png`,
      script
    })

    if (!this.generatingImage) this.generateNextImage()
  }

  generateNextImage () {
    this.generatingImage = true
    const { filename, script } = this.generateImageQueue.shift()
    const scriptWithoutTitle = script.split('\n').filter(s => s.indexOf('title: ') < 0).join('\n')
    const shouldGenerateImage = scriptWithoutTitle !== this.lastGeneratedScriptWithoutTitle

    if (!shouldGenerateImage) {
      if (this.generateImageQueue.length > 0) {
        this.generateNextImage()
      } else {
        this.generatingImage = false
      }
      return
    }

    const mmdc = spawn('mmdc', ['-i', '-', '-o', filename])
    mmdc.on('close', async () => {
      let imgAsString
      try {
        imgAsString = await imgcat(filename)
      } catch (err) {
        console.log(`[ERROR] CANNOT PRINT ${filename}`)
        console.log(script)
      }

      if (imgAsString) console.log(imgAsString)

      this.lastGeneratedScriptWithoutTitle = scriptWithoutTitle

      if (this.generateImageQueue.length > 0) {
        this.generateNextImage()
      } else {
        this.generatingImage = false
      }
    })
    mmdc.stdin.write(script)
    mmdc.stdin.end()
  }
}

export default Grapher

if (isRunThroughCli) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('Use as ./grapher.js <dir>')
    process.exit(1)
  }

  const grapher = new Grapher()

  const logFilenames = fs
    .readdirSync(dir)
    .filter(dir => dir.endsWith('.log'))

  const combinedLogFileSortedByTime = logFilenames
    .map((logFilename, index) => fs
      .readFileSync(`${dir}/${logFilename}`)
      .toString()
      .trim()
      .split('\n')
      .map(entry => {
        entry = JSON.parse(entry)
        const userId = (entry.props?.username || entry.props?.alias || `User-${index + 1}`).replace(/[^\x00-\x7F]/g, '').replaceAll(' ', '_') // eslint-disable-line no-control-regex
        const swarmIdShort = entry.props?.swarmId?.slice(0, 8)
        entry.userId = swarmIdShort ? `${userId}___${swarmIdShort}` : userId
        return entry
      })
    )
    .flat()
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  combinedLogFileSortedByTime.forEach(entry => grapher.add(entry))

  // fs.writeFileSync(`${dir}/combinedLogFileSortedByTime.json`, JSON.stringify(combinedLogFileSortedByTime))
}
