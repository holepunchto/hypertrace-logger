import { spawn, execSync } from 'child_process'
import sharp from 'sharp'
import path from 'path'
import fs from 'fs'

generateVideo('./images')

async function generateVideo (dir) {
  let { maxWidth, maxHeight } = await findMaxDimensions(dir)

  // Make sure they're divisible by 2 (ffmpeg requirement when padding)
  maxWidth = maxWidth % 2 === 0 ? maxWidth : maxWidth + 1
  maxHeight = maxHeight % 2 === 0 ? maxHeight : maxHeight + 1

  const args = [
    '-framerate 1',
    '-pattern_type glob',
    `-i "${dir}/img-*.png"`,
    `-vf "pad=${maxWidth}:${maxHeight}:(ow-iw)/2:0:white"`,
    '-c:v libx264',
    '-pix_fmt yuv420p',
    '-movflags',
    '+faststart',
    '-y',
    'video-by-concatting-images.mov'
  ]
  execSync(`ffmpeg ${args.join(' ')}`, { shell: true })
}

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
