const sharp = require('sharp');

sharp('icon.svg')
  .png()
  .toFile('icon.png')
  .then(() => {
    console.log('Successfully generated transparent PNG from SVG');
  })
  .catch(err => {
    console.error('Error generating PNG:', err);
  });
