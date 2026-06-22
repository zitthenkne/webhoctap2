const sharp = require('sharp');
const PINK = { r:0xFF, g:0xD9, b:0xE8, alpha:1 };
const SRC = 'assets/logo.png';

async function make(size, logoRatio, outFile){
  const logoSize = Math.round(size * logoRatio);
  const pad = Math.round((size - logoSize)/2);
  const logo = await sharp(SRC)
    .resize(logoSize, logoSize, { fit:'contain', background:{r:0,g:0,b:0,alpha:0} })
    .png().toBuffer();
  await sharp({ create:{ width:size, height:size, channels:4, background:PINK }})
    .composite([{ input: logo, top: pad, left: pad }])
    .png().toFile('assets/'+outFile);
  console.log('wrote assets/'+outFile, size+'x'+size, 'logo '+Math.round(logoRatio*100)+'%');
}

(async()=>{
  await make(192, 0.86, 'icon-192.png');
  await make(512, 0.86, 'icon-512.png');
  await make(192, 0.66, 'maskable-192.png');
  await make(512, 0.66, 'maskable-512.png');
  await make(180, 0.80, 'apple-touch-icon.png');
})();
