// var db = require('../config/connection');
// let COLLECTION = require('../config/collections')
// const { ObjectId } = require('mongodb');
// const { DESIGNATIONS, STATUSES } = require('../constants/enums');
// const { logActivity } = require('./customer_interaction_helper');
// const getNextSequence = require('../utils/get_next_unique').getNextSequence;
// module.exports = {

//  assignHotLeadsToCRE: () => {
//   return new Promise(async (resolve, reject) => {
//     try {
//       const leadCol = db.get().collection(COLLECTION.LEADS);
//       const roundRobinCol = db.get().collection(COLLECTION.ROUNDROBIN);
//       const counterCol = db.get().collection(COLLECTION.COUNTER);
//       const activityCol = db.get().collection(COLLECTION.CUSTOMER_ACTIVITY);

//       const now = new Date();
//       const hoursAgo48 = new Date(now.getTime() - 48 * 60 * 60 * 1000);

//       // 1. Get all HOT leads created in last 48 hours
//       const hotLeads = await leadCol.find({
//         status: STATUSES.HOT,
//         created_at: { $gte: hoursAgo48 },
//         officer_id: { $nin: [null, "UNASSIGNED", ""] }
//       }).toArray();

//       if (hotLeads.length === 0) {
//         return resolve("No HOT leads found in the last 48 hours to assign.");
//       }

//       // 2. Get CRE round robin officers
//       const rrConfig = await roundRobinCol.findOne({ name: 'CRE' });
//       if (!rrConfig || !rrConfig.officers || rrConfig.officers.length === 0) {
//         return reject("Unable to assign leads: No officers found in CRE round robin config.");
//       }

//       const activityLogs = [];

//       for (const lead of hotLeads) {
//         const { value: counter } = await counterCol.findOneAndUpdate(
//           { _id: 'cre' },
//           { $inc: { sequence: 1 } },
//           { upsert: true, returnDocument: 'after' }
//         );

//         const officerIndex = (counter.sequence - 1) % rrConfig.officers.length;
//         const selectedOfficerId = rrConfig.officers[officerIndex];

//         // 3. Update lead status and officer assignment
//         await leadCol.updateOne(
//           { _id: lead._id },
//           {
//             $set: {
//               officer_id: new ObjectId(selectedOfficerId),
//               status: STATUSES.CRE,
//               updated_at: new Date()
//             }
//           }
//         );

//         // 4. Prepare log entry for bulk insert
//         activityLogs.push({
//           client_id: new ObjectId(lead._id),
//           type: 'status_update',
//           status: STATUSES.CRE,
//           comment: 'Assigned to CRE officer Automatically',
//           recruiter_id: (lead.recruiter_id && lead.recruiter_id !== 'UNASSIGNED' && lead.recruiter_id !== null)
//             ? new ObjectId(lead.recruiter_id)
//             : null,
//           officer_id: new ObjectId(selectedOfficerId),
//           created_at: new Date(),
//         });

//         console.log(`✅ Assigned lead ${lead.client_id} to CRE officer ${selectedOfficerId}`);
//       }

//       // 5. Bulk insert all activity logs
//       if (activityLogs.length > 0) {
//         await activityCol.insertMany(activityLogs);
//       }

//       resolve(`✅ Processed ${hotLeads.length} HOT leads and assigned to CRE`);
//     } catch (error) {
//       console.error("❌ Scheduler Error:", error);
//       reject("Failed to assign HOT leads to CRE");
//     }
//   });
// }



// }