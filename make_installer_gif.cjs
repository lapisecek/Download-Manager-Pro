const Jimp = require('jimp');
const { GifFrame, GifUtil, GifCodec } = require('gifwrap');
const path = require('path');

async function createSplash() {
  const frames = [];
  const width = 400;
  const height = 300;
  
  // Load the transparent app icon
  const icon = await Jimp.read(path.join(__dirname, 'build', 'icon.png'));
  icon.resize(100, 100); // Scale down for splash
  
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

  // Generate 20 frames for a smooth loading bar animation
  for (let i = 0; i <= 20; i++) {
    const frameImg = new Jimp(width, height, 0x111118FF); // Dark background #111118
    
    // Paste icon in the center
    frameImg.composite(icon, (width - 100) / 2, (height - 100) / 2 - 20);
    
    // Draw text
    frameImg.print(font, 0, (height - 100) / 2 + 100, {
      text: 'Installing DM Pro...',
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER
    }, width);
    
    // Draw loading bar background
    const barWidth = 200;
    const barHeight = 6;
    const barX = (width - barWidth) / 2;
    const barY = height - 40;
    
    for (let x = 0; x < barWidth; x++) {
      for (let y = 0; y < barHeight; y++) {
        frameImg.setPixelColor(0x333344FF, barX + x, barY + y); // Gray background
      }
    }
    
    // Draw loading bar progress
    const progressWidth = (barWidth / 20) * i;
    for (let x = 0; x < progressWidth; x++) {
      for (let y = 0; y < barHeight; y++) {
        frameImg.setPixelColor(0x60a5faFF, barX + x, barY + y); // Blue progress
      }
    }
    
    // Convert Jimp image to gifwrap frame
    const frame = new GifFrame(frameImg.bitmap.width, frameImg.bitmap.height, frameImg.bitmap.data);
    GifUtil.quantizeSorokin(frame);
    frame.delayCentisecs = 5; // 50ms per frame
    frames.push(frame);
  }
  
  // Save as GIF
  const codec = new GifCodec();
  await codec.encodeGif(frames, { loops: 0 }).then(gif => {
    require('fs').writeFileSync(path.join(__dirname, 'build', 'installer.gif'), gif.buffer);
    console.log('Successfully generated animated installer.gif!');
  });
}

createSplash().catch(console.error);
