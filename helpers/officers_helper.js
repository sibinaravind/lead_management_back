var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const sharp = require('sharp');
const path = require('path');

const fileUploader = require('../utils/fileUploader');
// Make sure processAndStoreBase64File is exported in fileUploader.js


var fs = require('fs');
const bcrypt = require('bcrypt');
const ensureDirectoryExists = (directory) => {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
};

const SALT_ROUNDS = 10;
module.exports = {
// Create Officer
 createOfficer : async (details) => {
  return new Promise(async (resolve, reject) => {
    let documentPath = null;
    try {
         const collection = db.get().collection(COLLECTION.OFFICERS);

      // 1. Check for duplicates
      const existingOfficer = await collection.findOne({
        $or: [
          { email: details.email },
          { phone: details.phone }
        ]
      });
      if (existingOfficer) return reject("Officer already exists with this email or phone");

    
      // 1. Handle document upload
      if (details.doc_file?.base64) {
        const uploadsDir = './uploads/officers_docs';
        const originalName = details.doc_file.name || 'file';
        const clientName = `${details.first_name || 'client'}_${details.last_name || ''}`.replace(/\s+/g, '').toLowerCase();
        // Use the correct function reference from the imported module
        documentPath = await fileUploader.processAndStoreBase64File(
          details.doc_file.base64,
          originalName,
          clientName,
          uploadsDir
        );

        details.document_path = documentPath;
      }

      // 2. Generate unique officer ID
      let officerId;
      while (true) {
        officerId = 'AE' + Math.floor(100000 + Math.random() * 900000);
        const exists = await collection.findOne({ officer_id: officerId });
        if (!exists) break;
      }

      // 3. Hash password
      const hashedPassword = await bcrypt.hash(details.password.toString(), SALT_ROUNDS);

      // 4. Prepare data
      const officerData = {
        officer_id: officerId,
        salutation: details.salutation,
        first_name: details.first_name,
        middle_name: details.middle_name,
        last_name: details.last_name,
        dob: details.dob,
        gender: details.gender,
        email: details.email,
        phone: details.phone,
        alternate_phone: details.alternate_phone,
        address: details.address,
        city: details.city,
        state: details.state,
        country: details.country,
        status: details.status,
        emergency_contact: details.emergency_contact,
        emergency_contact_name: details.emergency_contact_name,
        emergency_contact_relation: details.emergency_contact_relation,
        designation: details.designation,
        branch: details.branch,
        password: hashedPassword,
        document_path: details.document_path || null,
        created_at: new Date()
      };

      // 5. Insert officer
      const result = await collection.insertOne(officerData);
      if (result.acknowledged) {
        resolve(result.insertedId);
      } else {
        // Remove uploaded file if insert failed
        if (documentPath && fs.existsSync(documentPath)) {
          fs.unlinkSync(documentPath);
        }
        reject("Insert failed");
      }

    } catch (err) {
      // Remove uploaded file if error occurs
      if (documentPath && fs.existsSync(documentPath)) {
        fs.unlinkSync(documentPath);
      }
      console.error(err);
      reject("Error processing request");
    }
  });
},


// List Officers
listOfficers: () => {
  return new Promise(async (resolve, reject) => {
    try {
      const officers = await db.get().collection(COLLECTION.OFFICERS)
        .find(
          { status: { $ne: 'deleted' } },
          {
            projection: {
              officer_id: 1,
              salutation: 1,
              first_name: 1,
              middle_name: 1,
              last_name: 1,
              gender: 1,
              email: 1,
              phone: 1,
              designation: 1,
              branch: 1
            }
          }
        )
        .toArray();
      resolve(officers);
    } catch (error) {
      reject("Error processing request");
    }
  });
},

// Edit Officer
 editOfficer : async (id, details) => {
  return new Promise(async (resolve, reject) => {
    try {
      let updateData = { ...details };
      if (details.password) {
        updateData.password = await bcrypt.hash(details.password.toString(), SALT_ROUNDS);
      } else {
        delete updateData.password;
      }
      const result = await db.get().collection(COLLECTION.OFFICERS)
        .updateOne(
          { _id: ObjectId(id) },
          { $set: updateData }
        );
      if (result.modifiedCount > 0) {
        resolve("Updated");
      } else {
        reject("Error processing request");
      }
    } catch (error) {
      reject("Error processing request");
    }
  });
},

updateOfficerPassword: async (id,details) => {
  try {
    const collection = db.get().collection(COLLECTION.OFFICERS);
    const officer = await collection.findOne({ _id: ObjectId(id) });
    if (!officer) throw "Officer not found";

    const isMatch = await bcrypt.compare(details.password.toString(), officer.password);
    if (!isMatch) throw "Password does not match";

    const hashedPassword = await bcrypt.hash(details.new_password.toString(), SALT_ROUNDS);
    const result = await collection.updateOne(
      { _id: ObjectId(id) },
      { $set: { password: hashedPassword } }
    );
    if (result.modifiedCount > 0) {
      return "Password updated";
    } else {
      throw "Password unchanged";
    }
  } catch (error) {
  
    throw error ||"Error processing request";
  }
},

updateOfficerStatus: async (id, status) => {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await db.get().collection(COLLECTION.OFFICERS)
        .updateOne(
          { _id: ObjectId(id) },
          { $set: { status: status } }
        );
      if (result.modifiedCount > 0) {
        resolve("Status updated");
      } else {
        reject("Officer not found or status unchanged");
      }
    } catch (error) {
      reject("Error processing request");
    }
  });
},

getOfficer: async (id) => {
  return new Promise(async (resolve, reject) => {
    try {
      const officer = await db.get().collection(COLLECTION.OFFICERS)
        .findOne({ _id: ObjectId(id) }, { projection: { password: 0 } });
      if (officer) {
        resolve(officer);
      } else {
        reject("Officer not found");
      }
    } catch (error) {
      reject("Error processing request");
    }
  });
},
}




//  createOfficer : async (details) => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       const collection = db.get().collection(COLLECTION.OFFICERS);

//       // 1. Check for duplicates
//       const existingOfficer = await collection.findOne({
//         $or: [
//           { email: details.email },
//           { phone: details.phone }
//         ]
//       });
//       if (existingOfficer) return reject("Officer already exists with this email or phone");

//       // 2. Handle document upload
//       if (details.doc_file?.base64) {
//         const uploadsDir = './uploads/officers_docs';
//         ensureDirectoryExists(uploadsDir);

//         let base64Data = details.doc_file.base64;
//         let ext = '';

//         // Extract extension if data URL prefix exists
//         const match = base64Data.match(/^data:(.*\/(.*));base64,/);
//         if (match) {
//           ext = match[2].toLowerCase();
//           base64Data = base64Data.replace(/^data:.*;base64,/, '');
//         } else if (details.doc_file.name) {
//           const extMatch = details.doc_file.name.match(/\.(\w+)$/);
//           ext = extMatch ? extMatch[1].toLowerCase() : 'bin'; // fallback
//         }

//         const clientName = `${details.first_name || 'client'}_${details.last_name || ''}`.replace(/\s+/g, '').toLowerCase();
//         const fileName = `${clientName}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}.${ext}`;
//         const documentPath = path.join(uploadsDir, fileName);

//         const buffer = Buffer.from(base64Data, 'base64');

//         // If image, convert to webp; else save as-is
//         if (['jpg', 'jpeg', 'png'].includes(ext)) {
//           await sharp(buffer).webp().toFile(documentPath.replace(/\.\w+$/, '.webp'));
//           details.document_path = documentPath.replace(/\.\w+$/, '.webp');
//         } else {
//           fs.writeFileSync(documentPath, buffer);
//           details.document_path = documentPath;
//         }
//       }

//       // 3. Generate unique officer ID
//       let officerId;
//       while (true) {
//         officerId = 'AE' + Math.floor(100000 + Math.random() * 900000);
//         const exists = await collection.findOne({ officer_id: officerId });
//         if (!exists) break;
//       }

//       // 4. Hash password
//       const hashedPassword = await bcrypt.hash(details.password.toString(), SALT_ROUNDS);

//       // 5. Prepare data
//       const officerData = {
//         officer_id: officerId,
//         salutation: details.salutation,
//         first_name: details.first_name,
//         middle_name: details.middle_name,
//         last_name: details.last_name,
//         dob: details.dob,
//         gender: details.gender,
//         email: details.email,
//         phone: details.phone,
//         alternate_phone: details.alternate_phone,
//         address: details.address,
//         city: details.city,
//         state: details.state,
//         country: details.country,
//         status: details.status,
//         emergency_contact: details.emergency_contact,
//         emergency_contact_name: details.emergency_contact_name,
//         emergency_contact_relation: details.emergency_contact_relation,
//         designtation: details.designtation,
//         branch: details.branch,
//         password: hashedPassword,
//         document_path: details.document_path || null,
//         created_at: new Date()
//       };

//       // 6. Insert officer
//       const result = await collection.insertOne(officerData);
//       result.acknowledged ? resolve(result.insertedId) : reject("Insert failed");

//     } catch (err) {
//       console.error(err);
//       reject("Error processing request");
//     }
//   });
// },
