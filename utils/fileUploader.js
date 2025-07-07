const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function processAndStoreBase64File({
  base64Data,
  originalName,
  clientName = 'default', 
  uploadsDir
}) {
  
  const sizeLimit = 3 * 1024 * 1024; // 2MB
  const fileSuffix = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  // Sanitize client name
  const safeClientName = (clientName || 'default').replace(/\s+/g, '_').toLowerCase();
  const  safeoriginalName = (originalName || 'oname').replace(/\s+/g, '_').toLowerCase();

  let fileName, documentPath;

  // Ensure upload folder exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Remove base64 prefix
  const cleanBase64 = base64Data.replace(/^data:.*;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');

  if (buffer.length > sizeLimit) {
    // Save base64 string as .txt
    fileName = `${safeoriginalName}_${safeClientName}_${fileSuffix}.txt`;
    documentPath = path.join(uploadsDir, fileName);
    fs.writeFileSync(documentPath, base64Data);
  } else {
    // Determine file extension
    let ext;
    const match = base64Data.match(/^data:(.*\/(.*));base64,/);
    if (match) {
      ext = match[2].toLowerCase();
    } else if (safeoriginalName) {
      const extMatch = safeoriginalName.match(/\.(\w+)$/);
      ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
    } else {
      ext = 'bin';
    }

    fileName = `${safeoriginalName}_${safeClientName}_${fileSuffix}.${ext}`;
    let filePath = path.join(uploadsDir, fileName);

    // If image, compress and convert to webp
    if (['jpg', 'jpeg', 'png'].includes(ext)) {
      filePath = filePath.replace(/\.\w+$/, '.webp');
      await sharp(buffer).webp({ quality: 70 }).toFile(filePath);
    } else {
      fs.writeFileSync(filePath, buffer);
    }

    documentPath = filePath;
  }

  return documentPath;
}

module.exports = {
  processAndStoreBase64File
};


// // utils/fileUploader.js
// const fs = require('fs');
// const path = require('path');
// const sharp = require('sharp');

// async function processAndStoreBase64File(base64Data, originalName, clientName, uploadsDir) {
//   const sizeLimit = 2 * 1024 * 1024; // 1MB
//   const fileSuffix = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
//   let fileName, documentPath;

//   if (!fs.existsSync(uploadsDir)) {
//     fs.mkdirSync(uploadsDir, { recursive: true });
//   }

//   // Remove data URL prefix if present
//   const cleanBase64 = base64Data.replace(/^data:.*;base64,/, '');
//   const buffer = Buffer.from(cleanBase64, 'base64');

//   if (buffer.length > sizeLimit) {
//     // Store as .txt file containing the base64 string
//     fileName = `${originalName}_${clientName}_${fileSuffix}.txt`;
//     documentPath = path.join(uploadsDir, fileName);
//     fs.writeFileSync(documentPath, base64Data);
//   } else {
//     // Determine file extension
//     let ext;
//     const match = base64Data.match(/^data:(.*\/(.*));base64,/);
//     if (match) {
//       ext = match[2].toLowerCase();
//     } else if (originalName) {
//       const extMatch = originalName.match(/\.(\w+)$/);
//       ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
//     } else {
//       ext = 'bin';
//     }

//     fileName = `${originalName}_${clientName}_${fileSuffix}.${ext}`;
//     let filePath = path.join(uploadsDir, fileName);

//     // If image, convert to webp; else save as-is
//     if (['jpg', 'jpeg', 'png'].includes(ext)) {
//       filePath = filePath.replace(/\.\w+$/, '.webp');
//       await sharp(buffer).webp().toFile(filePath);
//     } else {
//       fs.writeFileSync(filePath, buffer);
//     }
//     documentPath = filePath;
//   }

//   return documentPath;
// }

// module.exports = {
//   processAndStoreBase64File
// };
