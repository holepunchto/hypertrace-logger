import fs from 'fs'
import { execSync } from 'child_process'
import path from 'path'
import sharp from 'sharp'

const imagesDir = './images'
const outputDir = './tmp-videos'
const outputFilename = 'video-by-actual-time.mov'
let { maxWidth, maxHeight } = await findMaxDimensions(imagesDir)
maxWidth = maxWidth % 2 === 0 ? maxWidth : maxWidth + 1
maxHeight = maxHeight % 2 === 0 ? maxHeight : maxHeight + 1

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir)
}

const imageFiles = fs.readdirSync(imagesDir).filter(file => file.startsWith('img-') && file.endsWith('.png')).sort()

const durations = imageFiles.map((file, index, array) => {
  if (index === array.length - 1) return 5000

  // Are you having fun yet?
  const timestampCurrent = new Date(file.split('-').slice(2).join('-').split('.png')[0].replaceAll('.', ':').slice(0, -5) + file.substr(-9, 5)).getTime()
  const timestampNext = new Date(array[index + 1].split('-').slice(2).join('-').split('.png')[0].replaceAll('.', ':').slice(0, -5) + array[index + 1].substr(-9, 5)).getTime()

  const durationMs = timestampNext - timestampCurrent
  return Math.max(10, durationMs)
})

// Generate short video clips for each image
imageFiles.forEach((file, index) => {
  const duration = durations[index]
  const inputPath = path.join(imagesDir, file)
  const outputPath = path.join(outputDir, `clip${index.toString().padStart(4, '0')}.mov`)

  const frameRate = 1000 / duration
  const cmd = `ffmpeg -framerate ${frameRate} -i "${inputPath}" -vf "pad=${maxWidth}:${maxHeight}:(ow-iw)/2:0:white,setpts=PTS-STARTPTS" -c:v libx264 -pix_fmt yuv420p -movflags +faststart -y "${outputPath}"`

  execSync(cmd)
})

const fileList = fs.readdirSync(outputDir).sort().map(file => `file '${file}'`).join('\n')
fs.writeFileSync(path.join(outputDir, 'filelist.txt'), fileList)

// Concatenate all clips into the final video
const concatCmd = `ffmpeg -f concat -safe 0 -i "${path.join(outputDir, 'filelist.txt')}" -c copy -y "${outputFilename}"`
execSync(concatCmd)

console.log('Done')

async function findMaxDimensions (dir) {
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.png'))

  let maxWidth = 0
  let maxHeight = 0

  for (const file of files) {
    const filePath = path.join(dir, file)
    const { width, height } = await sharp(filePath).metadata()
    if (width > maxWidth) {
      maxWidth = width
    }
    if (height > maxHeight) {
      maxHeight = height
    }
  }

  return {
    maxWidth,
    maxHeight
  }
}
