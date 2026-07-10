import { Jimp } from 'jimp';
import path from 'path';

async function makeTransparent(inputPath, outputPath) {
  try {
    const image = await Jimp.read(inputPath);
    
    // Get the color of the top-left pixel to use as the background color to remove
    const bgColor = image.getPixelColor(0, 0);
    
    // Tolerance for color matching
    const tolerance = 15;
    
    image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
      const color = this.getPixelColor(x, y);
      
      const r1 = (bgColor >> 24) & 255;
      const g1 = (bgColor >> 16) & 255;
      const b1 = (bgColor >> 8) & 255;
      
      const r2 = (color >> 24) & 255;
      const g2 = (color >> 16) & 255;
      const b2 = (color >> 8) & 255;
      
      const distance = Math.sqrt(
        Math.pow(r1 - r2, 2) + 
        Math.pow(g1 - g2, 2) + 
        Math.pow(b1 - b2, 2)
      );
      
      if (distance < tolerance) {
        this.bitmap.data[idx + 3] = 0; // Set alpha to 0 (transparent)
      }
    });

    await image.write(outputPath);
    console.log('Successfully made background transparent');
  } catch (error) {
    console.error('Error processing image:', error);
  }
}

const input = process.argv[2];
const output = process.argv[3];
makeTransparent(input, output);
