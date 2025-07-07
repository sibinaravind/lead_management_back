
var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');

const fileUploader = require('../utils/fileUploader');
var fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');


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
          { officer_id: details.officerId },
          { phone: details.phone }
        ]
      });
      if (existingOfficer) return reject("Officer already exists with this officer id or phone");

      // 2. Validate status
      const allowedStatuses = ['ACTIVE', 'INACTIVE', 'BLOCKED'];
      if (!allowedStatuses.includes(details.status)) {
        return reject("Invalid status.");
      }

      // 3. Hash password
      const hashedPassword = await bcrypt.hash(details.password.toString(), SALT_ROUNDS);

      // 4. Prepare data
      const officerData = {
        officer_id: details.officer_id,
        name: details.name,
        status: details.status,
        phone: details.phone,
        gender: details.gender,
        company_phone_number: details.company_phone_number,
        designation: details.designation,
        department: details.department,
        branch: details.branch,
        password: hashedPassword,
        officers:[],
        created_at: new Date()
      };

      // 5. Insert officer
      const result = await collection.insertOne(officerData);
      if (result.acknowledged) {
        resolve(result.insertedId);
      } else {
        reject("Insert failed");
      }

    } catch (err) {
      reject("Error processing request");
    }
  });
},

// List Officers
listOfficers: () => {
  return new Promise(async (resolve, reject) => {
    try {
      console.log("Fetching officers list");
      resolve(await db.get().collection(COLLECTION.OFFICERS)
        .find(
        {},
          {
            projection: {
              officer_id: 1,
              name: 1,
              status: 1,
              gender: 1,
              phone: 1,
              company_phone_number: 1,
              designation: 1,
              department: 1,
              branch: 1,
              officers:1,
              created_at: 1,
            }
          }
        )
        .toArray());
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
      // Validate status if present
      if (updateData.status) {
        const allowedStatuses = ['ACTIVE', 'INACTIVE', 'BLOCKED'];
        if (!allowedStatuses.includes(updateData.status)) {
          return reject("Invalid status.");
        }
      }
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

loginOfficer: async (officer_id, password) => {
  const JWT_SECRET = process.env.JWT_SECRET ;

  return new Promise(async (resolve, reject) => {
    try {
      const collection = db.get().collection(COLLECTION.OFFICERS);
      const officer = await collection.findOne({ officer_id: officer_id });
      if (!officer) return reject("Officer not found");

      const isMatch = await bcrypt.compare(password.toString(), officer.password);
      if (!isMatch) return reject("Invalid credentials");

      // Prepare JWT payload
      const payload = {
        officer_id: officer.officer_id,
        department: officer.department,
        branch: officer.branch
      };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30m' });
      // Exclude password from response
      const { password: pwd, ...officerData } = officer;
      resolve({ officer: officerData, token });
    } catch (error) {
      reject("Error processing request");
    }
  });
},

deleteOfficer: async (id) => {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await db.get().collection(COLLECTION.OFFICERS)
        .deleteOne({ _id: ObjectId(id) });
      if (result.deletedCount > 0) {
        resolve("Officer permanently deleted");
      } else {
        reject("Officer not found or already deleted");
      }
    } catch (error) {
      reject("Error processing request");
    }
  });
},
addOfficerUnderOfficer: async (lead_officer_id, officer_id) => {
  return new Promise(async (resolve, reject) => {
    try {
      const collection = db.get().collection(COLLECTION.OFFICERS);

      const result = await collection.updateOne(
        {
          officer_id:lead_officer_id,
          officers: { $ne: officer_id }
        },
        {
          $addToSet: { officers: officer_id }
        }
      );

      if (result.modifiedCount > 0) {
        resolve("Officer added under officer");
      } else {
        reject("Officer already exists under this officer or lead officer not found");
      }
    } catch (error) {
      console.error(error);
      reject("Error processing request");
    }
  });
},


removeOfficerUnderOfficer: async (lead_officer_id, officer_id) => {
  return new Promise(async (resolve, reject) => {
    try {
      const collection = db.get().collection(COLLECTION.OFFICERS);

      const result = await collection.updateOne(
        {
          officer_id:lead_officer_id,
          officers: officer_id 
        },
        {
          $pull: { officers: officer_id }
        }
      );

      if (result.modifiedCount > 0) {
        resolve("Officer removed from under officer");
      } else {
        reject("Officer not found under this officer or lead officer not found");
      }
    } catch (error) {
      console.error(error);
      reject("Error processing request");
    }
  });
},
listLeadOfficers: () => {
  return new Promise(async (resolve, reject) => {
    try {
      const officers = await db.get().collection(COLLECTION.OFFICERS).aggregate([
        {
          $match: {
            designation: { $elemMatch: { $regex: '^team lead$', $options: 'i' } }
          }
        },
        {
          $lookup: {
            from: COLLECTION.OFFICERS,
            localField: "officers",
            foreignField: "officer_id",
            as: "officers_details",
            pipeline: [
              {
                $project: {
                  _id: 0,
                  officer_id: 1,
                  name: 1,
                  branch: { $arrayElemAt: ["$branch", 0] },
                  designation: { $arrayElemAt: ["$designation", 0] }
                }
              }
            ]
          }
        },
        {
          $project: {
            officer_id: 1,
            name: 1,
            status: 1,
            gender: 1,
            phone: 1,
            company_phone_number: 1,
            designation: 1,
            department: 1,
            branch: 1,
            created_at: 1,
            officers: {
              $map: {
                input: "$officers_details",
                as: "officer",
                in: {
                  id: "$$officer.officer_id",
                  name: "$$officer.name",
                  branch: "$$officer.branch",
                  designation: "$$officer.designation"
                }
              }
            }
          }
        }
      ]).toArray();

      resolve(officers);
    } catch (error) {
      console.error(error);
      reject("Error processing request");
    }
  });
}

// Permanently Delete Officer

}





// var db = require('../config/connection');
// let COLLECTION = require('../config/collections')
// const { ObjectId } = require('mongodb');

// const fileUploader = require('../utils/fileUploader');

// var fs = require('fs');
// const bcrypt = require('bcrypt');


// const SALT_ROUNDS = 10;
// module.exports = {
// // Create Officer
//  createOfficer : async (details) => {
//   return new Promise(async (resolve, reject) => {
//     let documentPath = null;
//     try {
//          const collection = db.get().collection(COLLECTION.OFFICERS);

//       // 1. Check for duplicates
//       const existingOfficer = await collection.findOne({
//         $or: [
//           { email: details.email },
//           { phone: details.phone }
//         ]
//       });
//       if (existingOfficer) return reject("Officer already exists with this email or phone");

    
//       // 1. Handle document upload
//       if (details.doc_file?.base64) {
//         const uploadsDir = './uploads/officers_docs';
//         const originalName = details.doc_file.name || 'file';
//         const clientName = `${details.first_name || 'client'}_${details.last_name || ''}`.replace(/\s+/g, '').toLowerCase();
//         // Use the correct function reference from the imported module
//         documentPath = await fileUploader.processAndStoreBase64File(
//           details.doc_file.base64,
//           originalName,
//           clientName,
//           uploadsDir
//         );

//         details.document_path = documentPath;
//       }

//       // 2. Generate unique officer ID
//       let officerId;
//       while (true) {
//         officerId = 'AE' + Math.floor(100000 + Math.random() * 900000);
//         const exists = await collection.findOne({ officer_id: officerId });
//         if (!exists) break;
//       }

//       // 3. Hash password
//       const hashedPassword = await bcrypt.hash(details.password.toString(), SALT_ROUNDS);

//       // 4. Prepare data
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
//         designation: details.designation,
//         branch: details.branch,
//         password: hashedPassword,
//         round_robin: details.round_robin || false,
//         document_path: details.document_path || null,
//         created_at: new Date()
//       };

//       // 5. Insert officer
//       const result = await collection.insertOne(officerData);
//       if (result.acknowledged) {
//         resolve(result.insertedId);
//       } else {
//         // Remove uploaded file if insert failed
//         if (documentPath && fs.existsSync(documentPath)) {
//           fs.unlinkSync(documentPath);
//         }
//         reject("Insert failed");
//       }

//     } catch (err) {
//       // Remove uploaded file if error occurs
//       if (documentPath && fs.existsSync(documentPath)) {
//         fs.unlinkSync(documentPath);
//       }
//       console.error(err);
//       reject("Error processing request");
//     }
//   });
// },


// // List Officers
// listOfficers: () => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       const officers = await db.get().collection(COLLECTION.OFFICERS)
//         .find(
//           { status: { $ne: 'deleted' } },
//           {
//             projection: {
//               officer_id: 1,
//               salutation: 1,
//               first_name: 1,
//               middle_name: 1,
//               last_name: 1,
//               gender: 1,
//               email: 1,
//               phone: 1,
//               designation: 1,
//               branch: 1
//             }
//           }
//         )
//         .toArray();
//       resolve(officers);
//     } catch (error) {
//       reject("Error processing request");
//     }
//   });
// },

// // Edit Officer
//  editOfficer : async (id, details) => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       let updateData = { ...details };
//       if (details.password) {
//         updateData.password = await bcrypt.hash(details.password.toString(), SALT_ROUNDS);
//       } else {
//         delete updateData.password;
//       }
//       const result = await db.get().collection(COLLECTION.OFFICERS)
//         .updateOne(
//           { _id: ObjectId(id) },
//           { $set: updateData }
//         );
//       if (result.modifiedCount > 0) {
//         resolve("Updated");
//       } else {
//         reject("Error processing request");
//       }
//     } catch (error) {
//       reject("Error processing request");
//     }
//   });
// },

// updateOfficerPassword: async (id,details) => {
//   try {
//     const collection = db.get().collection(COLLECTION.OFFICERS);
//     const officer = await collection.findOne({ _id: ObjectId(id) });
//     if (!officer) throw "Officer not found";

//     const isMatch = await bcrypt.compare(details.password.toString(), officer.password);
//     if (!isMatch) throw "Password does not match";

//     const hashedPassword = await bcrypt.hash(details.new_password.toString(), SALT_ROUNDS);
//     const result = await collection.updateOne(
//       { _id: ObjectId(id) },
//       { $set: { password: hashedPassword } }
//     );
//     if (result.modifiedCount > 0) {
//       return "Password updated";
//     } else {
//       throw "Password unchanged";
//     }
//   } catch (error) {
  
//     throw error ||"Error processing request";
//   }
// },

// updateOfficerStatus: async (id, status) => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       const result = await db.get().collection(COLLECTION.OFFICERS)
//         .updateOne(
//           { _id: ObjectId(id) },
//           { $set: { status: status } }
//         );
//       if (result.modifiedCount > 0) {
//         resolve("Status updated");
//       } else {
//         reject("Officer not found or status unchanged");
//       }
//     } catch (error) {
//       reject("Error processing request");
//     }
//   });
// },

// getOfficer: async (id) => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       const officer = await db.get().collection(COLLECTION.OFFICERS)
//         .findOne({ _id: ObjectId(id) }, { projection: { password: 0 } });
//       if (officer) {
//         resolve(officer);
//       } else {
//         reject("Officer not found");
//       }
//     } catch (error) {
//       reject("Error processing request");
//     }
//   });
// },
// }



//  {
//     "salutation": "Mr",
//     "first_name": "John",
//     "middle_name": "A.",
//     "last_name": "Doe",
//     "dob": "1990-01-01",
//     "gender": "Male",
//     "email": "john.doe@example.co",
//     "phone": "+123456789",
//     "alternate_phone": "+0987654321",
//     "address": "123 Main Street",
//     "city": "New York",
//     "state": "NY",
//     "country": "USA",
//     "status": "inactive",
//     "emergency_contact": "+1122334455",
//     "emergency_contact_name": "Jane Doe",
//     "emergency_contact_relation": "Spouse",
//     "designation": ["Manager"],
//     "branch":["Head Office"],
//     "password":123,
//     "doc_file":{
//         "name":"docs",
//         "base64":"data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iago8PAovVGl0bGUgKP7/KQovQ3JlYXRvciAo/v8AdwBrAGgAdABtAGwAdABvAHAAZABmACAAMAAuADEAMgAuADIALgAxKQovUHJvZHVjZXIgKP7/AFEAdAAgADQALgA4AC4ANikKL0NyZWF0aW9uRGF0ZSAoRDoyMDI1MDUwNDEyNDM1OCswNSczMCcpCj4