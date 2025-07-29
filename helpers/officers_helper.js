
var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const SALT_ROUNDS = 10;
const  officerValidation= require('../validations/officerValidation');
const validatePartial = require("../utils/validatePartial");
const { off } = require('../routes/officers/officers_router');

module.exports = {
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
        _id: officer._id,
        officer_id: officer.officer_id,
        designation: officer.designation,
        branch: officer.branch,
        officers: officer.officers || [],
      };
      const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30m' });
      // Exclude password from response
      const { password: pwd, ...officerData } = officer;
      officerData.token = token;
      resolve({ officer: officerData });
    } catch (error) {
      reject("Error processing request");
    }
  });
},

createOfficer : async (details) => {
  return new Promise(async (resolve, reject) => {
    const { error, value } = officerValidation.validate(details);
    if (error) return reject("Validation failed: " + error.details[0].message);
    details = value; 
    try {
      const collection = db.get().collection(COLLECTION.OFFICERS);
      const existingOfficer = await collection.findOne({
        $or: [
          { officer_id: details.officerId },
          { phone: details.phone }
        ]
      });
      if (existingOfficer) return reject("Officer already exists with this officer id or phone")
      const allowedStatuses = ['ACTIVE', 'INACTIVE', 'BLOCKED'];
      if (!allowedStatuses.includes(details.status)) {
        return reject("Invalid status.");
      }
      const hashedPassword = await bcrypt.hash(details.password.toString(), SALT_ROUNDS);
      const officerData = {
        officer_id: details.officer_id,
        name: details.name,
        status: details.status,
        phone: details.phone,
        gender: details.gender,
        company_phone_number: details.company_phone_number,
        designation: details.designation,
        branch: details.branch,
        password: hashedPassword,
        officers:[],
        created_at: new Date()
      };
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
      const updateData = validatePartial(officerValidation, details);
      // Validate status if present
      // if (updateData.status) {
      //   const allowedStatuses = ['ACTIVE', 'INACTIVE', 'BLOCKED'];
      //   if (!allowedStatuses.includes(updateData.status)) {
      //     return reject("Invalid status.");
      //   }
      // }
      console.log("Update Data:", updateData);
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
      reject( error || "Error processing request");
    }
  });
},

updateOfficerPassword: async (id, details) => {
  try {
    const collection = db.get().collection(COLLECTION.OFFICERS);
    const officer = await collection.findOne({ _id: ObjectId(id) });
    if (!officer) throw "Officer not found";

    const isMatch = await bcrypt.compare(details.current_password.toString(), officer.password);
    if (!isMatch) throw "Current password does not match";
    if (
      typeof details.new_password !== "string" ||
      details.new_password.length < 8 ||
      !/[A-Z]/.test(details.new_password) || // at least one capital letter
      !/[a-z]/.test(details.new_password) || // at least one lowercase letter
      !/\d/.test(details.new_password) ||
      !/[!@#$%^&*(),.?":{}|<>]/.test(details.new_password)
    ) {
      throw "New password must be at least 8 characters long and include an uppercase letter, a lowercase letter, a digit, and a symbol.";
    }
    details.new_password = details.new_password.toString();
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
    throw error || "Error processing request";
  }
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


addOfficerUnderOfficer: async ( data) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!ObjectId.isValid(data.officer.officer_id)) {
        return reject("Invalid officer_id: must be a valid ");
      }
      data.officer.officer_id = new ObjectId(data.officer.officer_id);const result = await db.get().collection(COLLECTION.OFFICERS).updateOne(
        {
          _id: new ObjectId(data.lead_officer_id),
          "officers.officer_id": { $ne: data.officer.officer_id }  // Avoid duplicates
        },
        {
          $addToSet: { officers: data.officer }  // Add only if not present
        }
      );

      console.log("Update result:", result);

      if (result.modifiedCount > 0) {
        resolve("Officer added under officer");
      } else {
        reject("Officer already exists under this officer or lead officer not found");
      }
    } catch (error) {
      reject(error);
    }
  });
},

editOfficerLeadPermission: async (data) => {
  return new Promise(async (resolve, reject) => {
    try {


      const { lead_officer_id, officer } = data;

      if (!lead_officer_id || !officer?.officer_id || typeof officer.edit_permission !== "boolean") {
        return reject("Invalid input: lead_officer_id, officer_id, or edit_permission is missing or invalid.");
      }

      const result = await db.get().collection(COLLECTION.OFFICERS).updateOne(
        {
          _id: new ObjectId(lead_officer_id),
          "officers.officer_id": officer.officer_id
        },
        {
          $set: {
            "officers.$.edit_permission": officer.edit_permission
          }
        }
      );

      if (result.modifiedCount > 0) {
        resolve("Officer permission updated successfully.");
      } else {
        reject("Officer not found under this lead officer or permission unchanged.");
      }
    } catch (error) {
      console.error("Error updating permission:", error);
      reject("Failed to update officer permission.");
    }
  });
},

deleteOfficerUnderOfficer: async (lead_officer_id, officer_id) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!lead_officer_id || !officer_id) {
        return reject("Missing lead_officer_id or officer_id");
      }
      const result = await db.get().collection(COLLECTION.OFFICERS).updateOne(
        {
          _id: new ObjectId(lead_officer_id)
        },
        {
          $pull: {
            officers: { officer_id: officer_id }
          }
        }
      );

      if (result.modifiedCount > 0) {
        resolve("Officer removed successfully.");
      } else {
        reject("Officer not found under this lead officer.");
      }
    } catch (error) {
      console.error("Error removing officer:", error);
      reject("Failed to remove officer.");
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
            officers: { $exists: true, $ne: [], $not: { $size: 0 } }
          }
        },
        {
          $lookup: {
            from: COLLECTION.OFFICERS,
            let: { underOfficers: "$officers" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $in: [
                      "$_id",
                      {
                        $map: {
                          input: "$$underOfficers",
                          as: "o",
                          in: { $toObjectId: "$$o.officer_id" }
                        }
                      }
                    ]
                  }
                }
              },
              {
                $project: {
                   _id: { $toString: "$_id" },
                  officer_id: { $toString: "$_id" },
                  // officer_id: 0,
                  name: 1,
                  phone: 1,
                  company_phone_number: 1,
                  branch: { $arrayElemAt: ["$branch", 0] },
                  designation: { $arrayElemAt: ["$designation", 0] }
                }
              }
            ],
            as: "officers_details"
          }
        },
        {
          $addFields: {
            officers: {
              $map: {
                input: "$officers",
                as: "assigned",
                in: {
                  $mergeObjects: [
                    "$$assigned",
                    {
                      $first: {
                        $filter: {
                          input: "$officers_details",
                          as: "detail",
                          cond: { $eq: ["$$detail._id", "$$assigned.officer_id"] }
                        }
                      }
                    }
                  ]
                }
              }
            }
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
            officers:1,
            officers_details:1,
            //  officers: "$officers_details"
          }
        }
      ]).toArray();
        const cleanedData = officers.map((item) => {
      const filteredOfficers = (item.officers || []).filter(officer => officer.name);
      const { officers_details, ...rest } = item;
      return {
        ...rest,
        officers: filteredOfficers
      };
    });
// resolve(cleanedData);
      resolve(cleanedData);
    } catch (error) {
      console.error(error);
      reject("Error processing request");
    }
  });
},
insertRoundRobin: async (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Convert officer IDs to ObjectId
      if (Array.isArray(data.officers)) {
        data.officers = data.officers.map(id => ObjectId(id));
      }
      const result = await db.get().collection(COLLECTION.ROUNDROBIN).insertOne(data);
      resolve({ success: true, id: result.insertedId });
    } catch (error) {
      reject("Failed to insert department: " + error);
    }
  });
},
deleteRoundRobin: async (id) => {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await db.get().collection(COLLECTION.ROUNDROBIN)
        .deleteOne({ _id: ObjectId(id) });
      if (result.deletedCount > 0) {
        resolve("Round robin deleted successfully");
      } else {
        reject("Round robin not found or already deleted");
      }
    } catch (error) {
      reject("Error deleting round robin");
    }
  });
},
// listAllRoundRobin: async () => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       const roundRobins = await db.get().collection(COLLECTION.ROUNDROBIN).find({}).toArray();
//       resolve(roundRobins);
//     } catch (error) {
//       reject("Error fetching round robin data");
//     }
//   });
// },

listAllRoundRobin: async () => {
  return new Promise(async (resolve, reject) => {
    try {
      const roundRobins = await db.get().collection(COLLECTION.ROUNDROBIN).aggregate([
        {
          $lookup: {
            from: COLLECTION.OFFICERS,
            localField: "officers",       
            foreignField: "_id",     
            as: "officer_details"
          }
        },
        {
          $project: {
            name: 1,
            country: 1,
          
            officer_details: {
              $map: {
                input: "$officer_details",
                as: "officer",
                in: {
                  _id: { $toString: "$$officer._id" },
                  name: "$$officer.name",
                  phone: "$$officer.phone",
                  company_phone_number: "$$officer.company_phone_number",
                  branch: "$$officer.branch",
                  designation: "$$officer.designation"
                }
              }
            }
          }
        }
      ]).toArray();

      resolve(roundRobins);
    } catch (error) {
      reject("Error fetching round robin with officer details");
    }
  });
},

insertStaffToRoundRobin: async (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { round_robin_id, officers } = data;

      const result = await  db.get().collection(COLLECTION.ROUNDROBIN).updateOne(
        { _id: ObjectId(round_robin_id) },
        { $addToSet: { officers: { $each: officers.map(id =>  ObjectId(id)) } } }
      );

      if (result.modifiedCount > 0) {
        resolve("New officers added");
      } else {
        resolve("No new officers added (maybe already present or round robin not found)");
      }
    } catch (err) {
      reject("Error: " + err);
    }
  });
},

removeStaffFromRoundRobin: async (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      const { round_robin_id, officers } = data;
      const result = await db.get().collection(COLLECTION.ROUNDROBIN).updateOne(
        { _id: new ObjectId(round_robin_id) },
        {
          $pull: {
            officers: { $in: officers.map(id => new ObjectId(id)) }
          }
        }
      );
      if (result.modifiedCount > 0) {
        resolve("Officers removed successfully");
      } else {
        reject("No officers were removed (maybe not found)");
      }
    } catch (err) {
      reject("Error removing officers: " + err);
    }
  });
},

}



//  listOfficers : async () => {
//   try {
//     const officers = await db.get().collection(COLLECTION.OFFICERS).aggregate([
//       {
//         $lookup: {
//           from: "config", // ensure this matches your actual collection name
//           let: { designationCodes: "$designation" },
//           pipeline: [
//             { $match: { name: "constants" } },
//             {
//               $project: {
//                 designation: {
//                   $filter: {
//                     input: "$designation",
//                     as: "d",
//                     cond: { $in: ["$$d.code", "$$designationCodes"] }
//                   }
//                 }
//               }
//             }
//           ],
//           as: "designationData"
//         }
//       },
//        {
//         $addFields: {
//           designation: {
//             $cond: {
//               if: { $gt: [{ $size: "$designationData" }, 0] },
//               then: {
//                 $map: {
//                   input: {
//                     $reduce: {
//                       input: "$designationData.designation",
//                       initialValue: [],
//                       in: { $concatArrays: ["$$value", "$$this"] }
//                     }
//                   },
//                   as: "d",
//                   in: "$$d.name"
//                 }
//               },
//               else: []
//             }
//           }
//         }
//       },
//       {
//         $project: {
//           officer_id: 1,
//           name: 1,
//           status: 1,
//           gender: 1,
//           phone: 1,
//           company_phone_number: 1,
//           designation: 1, // now contains designation objects
//           department: 1,
//           branch: 1,
//           officers: 1,
//           created_at: 1
//         }
//       }
//     ]).toArray();

//     return officers;
//   } catch (error) {
   
//     throw new Error("Error processing request");
//   }
// },

// listOfficers:async () => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       const officers = await db.get().collection(COLLECTION.OFFICERS).aggregate([
//         // Join configs collection
//         {
//       $lookup: {
//         from: "config",
//         let: { designationCodes: "$designation" }, // assuming [2, 3, ...]
//         pipeline: [
//           { $match: { name: "constants" } },
//           {
//             $project: {
//               designation: {
//                 $filter: {
//                   input: "$designation",
//                   as: "d",
//                   cond: { $in: ["$$d.code", "$$designationCodes"] }
//                 }
//               }
//             }
//           }
//         ],
//         as: "designationData"
//       }
//     },
//         // Flatten designationData.matchedDesignations directly into designation
//         // {
//         //   $addFields: {
//         //     designation: {
//         //       $cond: [
//         //         { $gt: [{ $size: "$designationData" }, 0] },
//         //         { $arrayElemAt: ["$designationData.matchedDesignations", 0] },
//         //         []
//         //       ]
//         //     }
//         //   }
//         // },
//         // {
//         //   $project: {
//         //     officer_id: 1,
//         //     name: 1,
//         //     status: 1,
//         //     gender: 1,
//         //     phone: 1,
//         //     company_phone_number: 1,
//         //     designation: 1, // enriched designation list
//         //     department: 1,
//         //     branch: 1,
//         //     officers: 1,
//         //     created_at: 1
//         //   }
//         // }
//       ]).toArray();

//       resolve(officers);
//     } catch (error) {
//       console.error("Aggregation Error:", error);
//       reject("Error processing request");
//     }
//   });
// },

// List Officers
// listOfficers: () => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       console.log("Fetching officers list");
//       resolve(await db.get().collection(COLLECTION.OFFICERS)
//         .find(
//         {},
//           {
//             projection: {
//               officer_id: 1,
//               name: 1,
//               status: 1,
//               gender: 1,
//               phone: 1,
//               company_phone_number: 1,
//               designation: 1,
//               department: 1,
//               branch: 1,
//               officers:1,
//               created_at: 1,
//             }
//           }
//         )
//         .toArray());
//     } catch (error) {
//       reject("Error processing request");
//     }
//   });
// },




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