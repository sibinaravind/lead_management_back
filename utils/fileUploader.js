const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function processAndStoreBase64File({
  base64Data,
  originalName,
  clientName = 'default', 
  uploadsDir
}) {
  const sizeLimit = 3 * 1024 * 1024; // 3MB
  const fileSuffix = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  
  // Sanitize client name
  const safeClientName = (clientName || 'default').replace(/\s+/g, '_').toLowerCase();
  const safeOriginalName = (originalName || 'oname').replace(/\s+/g, '_').toLowerCase();
  
  let fileName, documentPath;
  
  try {
    // Ensure upload folder exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Remove base64 prefix
    const cleanBase64 = base64Data.replace(/^data:.*;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    console.log(`Original file size: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
    
    // Determine file extension
    let ext;
    const match = base64Data.match(/^data:(.*?)\/(.*?);base64,/);
   
    if (match) {
      ext = match[2].toLowerCase();
      // Handle common MIME type variations
      if (ext === 'jpeg') ext = 'jpg';
    } else if (safeOriginalName && safeOriginalName.includes('.')) {
      const extMatch = safeOriginalName.match(/\.(\w+)$/);
      ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
    } else {
      ext = 'bin';
    }
    
    // Check if it's an image type that Sharp can handle
    const supportedImageTypes = ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'gif', 'svg'];
    const isImage = supportedImageTypes.includes(ext);
    
    if (buffer.length > sizeLimit) {
      console.log(`File size (${(buffer.length / 1024 / 1024).toFixed(2)}MB) exceeds limit. Processing large file...`);
      
      if (isImage) {
        // For large images, compress more aggressively
        fileName = `${safeOriginalName}_${safeClientName}_${fileSuffix}.webp`;
        documentPath = path.join(uploadsDir, fileName);
        
        try {
          // More aggressive compression for large images
          const sharpInstance = sharp(buffer);
          
          // Get image metadata to determine appropriate resize strategy
          const metadata = await sharpInstance.metadata();
          console.log(`Original image dimensions: ${metadata.width}x${metadata.height}`);
          
          let resizeOptions = {};
          
          // Determine resize strategy based on original size
          if (metadata.width > 2048 || metadata.height > 2048) {
            resizeOptions = {
              width: 1920,
              height: 1080,
              fit: 'inside',
              withoutEnlargement: true
            };
          } else if (metadata.width > 1024 || metadata.height > 1024) {
            resizeOptions = {
              width: 1024,
              height: 1024,
              fit: 'inside',
              withoutEnlargement: true
            };
          }
          
          let sharpPipeline = sharp(buffer);
          
          // Apply resize if needed
          if (Object.keys(resizeOptions).length > 0) {
            sharpPipeline = sharpPipeline.resize(resizeOptions);
          }
          
          // Apply WebP compression
          await sharpPipeline
            .webp({ 
              quality: 40, // Very aggressive compression for large files
              effort: 6,
              progressive: true
            })
            .toFile(documentPath);
          
          console.log(`Large image compressed and saved as WebP`);
          
        } catch (error) {
          console.error('Image compression failed:', error.message);
          
          // Fallback: try with original extension and less aggressive settings
          fileName = `${safeOriginalName}_${safeClientName}_${fileSuffix}.${ext}`;
          documentPath = path.join(uploadsDir, fileName);
          
          try {
            await sharp(buffer)
              .resize(1024, 1024, { 
                fit: 'inside', 
                withoutEnlargement: true 
              })
              .jpeg({ quality: 60 }) // Fallback to JPEG
              .toFile(documentPath.replace(/\.\w+$/, '.jpg'));
            
            documentPath = documentPath.replace(/\.\w+$/, '.jpg');
            console.log('Fallback compression successful');
            
          } catch (fallbackError) {
            console.error('Fallback compression also failed:', fallbackError.message);
            // Last resort: save original file
            fs.writeFileSync(documentPath, buffer);
            console.warn('Saved original large file without compression');
          }
        }
      } else {
        // For non-image large files, save as-is but warn
        fileName = `${safeOriginalName}_${safeClientName}_${fileSuffix}.${ext}`;
        documentPath = path.join(uploadsDir, fileName);
        
        console.warn(`Large non-image file (${(buffer.length / 1024 / 1024).toFixed(2)}MB) - saving without compression`);
        
        // Use streaming for very large files to avoid memory issues
        if (buffer.length > 10 * 1024 * 1024) { // 10MB+
          const writeStream = fs.createWriteStream(documentPath);
          await new Promise((resolve, reject) => {
            writeStream.write(buffer);
            writeStream.end();
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
          });
        } else {
          fs.writeFileSync(documentPath, buffer);
        }
      }
    } else {
      // Normal processing for files under size limit
      if (isImage) {
        fileName = `${safeOriginalName}_${safeClientName}_${fileSuffix}.webp`;
        documentPath = path.join(uploadsDir, fileName);
        
        try {
          await sharp(buffer)
            .webp({ 
              quality: 80,
              effort: 4 
            })
            .toFile(documentPath);
        } catch (error) {
          console.error('Normal image processing failed:', error.message);
          // Fallback to original format
          fileName = `${safeOriginalName}_${safeClientName}_${fileSuffix}.${ext}`;
          documentPath = path.join(uploadsDir, fileName);
          fs.writeFileSync(documentPath, buffer);
        }
      } else {
        fileName = `${safeOriginalName}_${safeClientName}_${fileSuffix}.${ext}`;
        documentPath = path.join(uploadsDir, fileName);
        fs.writeFileSync(documentPath, buffer);
      }
    }
    
    // Verify file was created and log final file size
    if (fs.existsSync(documentPath)) {
      const finalStats = fs.statSync(documentPath);
      const finalSizeMB = (finalStats.size / 1024 / 1024).toFixed(2);
      const compressionRatio = ((1 - finalStats.size / buffer.length) * 100).toFixed(1);
      
      console.log(`✓ File saved: ${path.basename(documentPath)}`);
      console.log(`✓ Final size: ${finalSizeMB}MB (${compressionRatio}% compression)`);
      
      return documentPath;
    } else {
      throw new Error('File was not created successfully');
    }
    
  } catch (error) {
    console.error('Error in processAndStoreBase64File:', error);
    throw error;
  }
}

// Export the function
module.exports = { processAndStoreBase64File };



// const fs = require('fs');
// const path = require('path');
// const sharp = require('sharp');

// async function processAndStoreBase64File({
//   base64Data,
//   originalName,
//   clientName = 'default', 
//   uploadsDir
// }) {
  
//   const sizeLimit = 3 * 1024 * 1024; // 2MB
//   const fileSuffix = `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

//   // Sanitize client name
//   const safeClientName = (clientName || 'default').replace(/\s+/g, '_').toLowerCase();
//   const  safeoriginalName = (originalName || 'oname').replace(/\s+/g, '_').toLowerCase();

//   let fileName, documentPath;

//   // Ensure upload folder exists
//   if (!fs.existsSync(uploadsDir)) {
//     fs.mkdirSync(uploadsDir, { recursive: true });
//   }

//   // Remove base64 prefix
//   const cleanBase64 = base64Data.replace(/^data:.*;base64,/, '');
//   const buffer = Buffer.from(cleanBase64, 'base64');

//   if (buffer.length > sizeLimit) {
//     // Save base64 string as .txt
//     fileName = `${safeoriginalName}_${safeClientName}_${fileSuffix}.txt`;
//     documentPath = path.join(uploadsDir, fileName);
//     fs.writeFileSync(documentPath, base64Data);
//   } else {
//     // Determine file extension
//     let ext;
//     const match = base64Data.match(/^data:(.*\/(.*));base64,/);
//     if (match) {
//       ext = match[2].toLowerCase();
//     } else if (safeoriginalName) {
//       const extMatch = safeoriginalName.match(/\.(\w+)$/);
//       ext = extMatch ? extMatch[1].toLowerCase() : 'bin';
//     } else {
//       ext = 'bin';
//     }

//     fileName = `${safeoriginalName}_${safeClientName}_${fileSuffix}.${ext}`;
//     let filePath = path.join(uploadsDir, fileName);

//     // If image, compress and convert to webp
//     if (['jpg', 'jpeg', 'png'].includes(ext)) {
//       filePath = filePath.replace(/\.\w+$/, '.webp');
//       await sharp(buffer).webp({ quality: 70 }).toFile(filePath);
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
