var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const { DESIGNATIONS, STATUSES } = require('../constants/enums');
const { logActivity } = require('./customer_interaction_helper');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;

module.exports = {
  getCustomer: async (id) => {
    return new Promise(async (resolve, reject) => {
      try {
        var lead = await db.get().collection(COLLECTION.LEADS).findOne({ _id: new ObjectId(id) });
        if (!lead) {
          lead = await db.get().collection(COLLECTION.DEAD_LEADS).findOne({ _id: new ObjectId(id) });
        }
        if (!lead) {
          lead = await db.get().collection(COLLECTION.CUSTOMERS).findOne({ _id: new ObjectId(id) });
        }
        if (lead) {
          resolve(lead);
        } else {
          reject("Customer not found");
        }
      } catch (err) {

        reject("Error fetching lead");
      }
    });
  },

  searchCustomer: async (query) => {
    try {
      if (!query) {
        return [];
      }
      const searchQuery = {
        $or: [
          { phone: { $regex: query, $options: 'i' } },
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { client_id: { $regex: query, $options: 'i' } }
        ]
      };
      const projection = {
        _id: 1,
        client_id: 1,
        name: 1,
        email: 1,
        phone: 1,
        service_type: 1,
        country_code: 1,
        status: 1,
        lead_source: 1,
        officer_id: 1,
        created_at: 1
      };

      // Search all collections in parallel
      const [leads, customers, deadLeads] = await Promise.all([
        db.get().collection(COLLECTION.LEADS).find(searchQuery, { projection }).toArray(),
        db.get().collection(COLLECTION.CUSTOMERS).find(searchQuery, { projection }).toArray(),
        db.get().collection(COLLECTION.DEAD_LEADS).find(searchQuery, { projection }).toArray()
      ]);

      // Combine and return all results
      return [...leads, ...customers, ...deadLeads];
    } catch (err) {
      console.error("Error searching customer:", err);
      throw new Error("Error searching customer");
    }
  },
  assignOfficerToLead: async (clientId, officerId, comment, assignedby) => {
    return new Promise(async (resolve, reject) => {
      try {
        if (!clientId || !officerId) {
          return reject("Client ID and Officer ID are required");
        }
        const clientObjectId = new ObjectId(clientId);
        const officerObjectId = new ObjectId(officerId);
        const leadsCollection = db.get().collection(COLLECTION.LEADS);
        const customersCollection = db.get().collection(COLLECTION.CUSTOMERS);
        const officersCollection = db.get().collection(COLLECTION.OFFICERS);

        // Fetch officer details
        const assignedOfficer = await officersCollection.findOne(
          { _id: officerObjectId },
          {
            projection: {
              name: 1,
              officer_id: 1,
              email: 1,
              designation: 1,
              branch: 1
            }
          }
        );

        if (!assignedOfficer) {
          return reject("Assigned officer not found");
        }

        let updateFields = {
          officer_id: officerObjectId
        };

        let recruiterIdValue = null;

        if (
          Array.isArray(assignedOfficer.designation) &&
          assignedOfficer.designation.includes(DESIGNATIONS.COUNSILOR)
        ) {
          updateFields.recruiter_id = officerObjectId;
          recruiterIdValue = officerObjectId;
        }

        // Try updating in LEADS collection
        let updateResult = await leadsCollection.findOneAndUpdate(
          { _id: clientObjectId },
          { $set: updateFields },
          { returnDocument: 'after' }
        );
        // If not found in LEADS, try CUSTOMERS
        if (!updateResult.value) {
          updateResult = await customersCollection.findOneAndUpdate(
            { _id: clientObjectId },
            { $set: updateFields },
            { returnDocument: 'after' }
          );
        }

        if (!updateResult.value) {
          return reject("Client not found in either LEADS or CUSTOMERS");
        }

        // Log the assignment
        // await customerActivityCollection.insertOne({
        //   type: 'assign_officer',
        //   client_id: clientObjectId,
        //   assigned_by: new ObjectId(assignedby),
        //   recruiter_id: recruiterIdValue || updateResult.value.recruiter_id || null,
        //   officer_id: ObjectId(officerObjectId),
        //   comment: comment || null,
        //   created_at: new Date()
        // });
        await logActivity({
          type: 'assign_officer',
          client_id: clientObjectId,
          assigned_by: assignedby,
          recruiter_id: recruiterIdValue || updateResult.value.recruiter_id || null,
          officer_id: officerObjectId,
          comment: comment || null
        });

        return resolve("Officer assigned successfully");

      } catch (err) {
        console.error(err);
        return reject("Error assigning officer to lead");
      }
    });
  },

  updateCustomerStatus: async (data, officerId) => {
    return new Promise(async (resolve, reject) => {
      try {
        if (!data.client_id || !data.client_status || data.client_status === 'null' || data.client_status === '') {
          return reject("Invalid or empty client status or client ID");
        }

        const clientId = new ObjectId(data.client_id);
        const status = data.client_status;

        const leadsCollection = db.get().collection(COLLECTION.LEADS);
        const customersCollection = db.get().collection(COLLECTION.CUSTOMERS);
        const deadLeadsCollection = db.get().collection(COLLECTION.DEAD_LEADS);

        // Try to fetch client from LEADS
        let clientDoc = await leadsCollection.findOne({ _id: clientId });
        let currentCollection = leadsCollection;

        // If not in LEADS, check CUSTOMERS
        if (!clientDoc) {
          clientDoc = await customersCollection.findOne({ _id: clientId });
          currentCollection = customersCollection;
        }

        if (!clientDoc) {
          return reject("Client not found");
        }
        if (status === STATUSES.DEAD) {
          clientDoc.status = status;
          const insertResult = await deadLeadsCollection.insertOne({
            ...clientDoc,
            moved_to_dead_at: new Date(),
            dead_reason: data.comment || ''
          });
          if (!insertResult.acknowledged) return reject("Failed to move to DEAD_LEADS");

          await currentCollection.deleteOne({ _id: clientId });
        }

        else if (status === STATUSES.REGISTER) {
          const client_id = `AECID${String(await getNextSequence("customer_id")).padStart(5, "0")}`;
          clientDoc.client_id = client_id;
          clientDoc.status = status;
          const insertResult = await customersCollection.insertOne({
            ...clientDoc
          });

          if (!insertResult.acknowledged) return reject("Failed to move to CUSTOMERS");

          await currentCollection.deleteOne({ _id: clientId });
        }

        else {
          await currentCollection.updateOne(
            { _id: clientId },
            { $set: { status: status } }
          );
          // Optional: check if update was successful
          // if (updateResult.modifiedCount === 0) return reject("Failed to update status");
        }
        // Log activity
        // const activityLog = {
        //   type: 'status_update',
        //   client_id: clientId,
        //   recruiter_id: clientDoc.recruiter_id || null,
        //   officer_id: ObjectId(officerId),
        //   client_status: status,
        //   comment: data.comment || '',
        //   created_at: new Date()
        // };
        const logResult = await logActivity({
          type: 'status_update',
          client_id: clientId,
          recruiter_id: clientDoc.recruiter_id || null,
          officer_id: ObjectId(officerId) || null,
          client_status: status,
          comment: data.comment || ''
        });
        // const logResult = await customerActivityCollection.insertOne(activityLog);
        if (!logResult.acknowledged) return reject("Client status updated but failed to log activity");
        resolve("Client status updated and logged");
      } catch (err) {
        console.error(err);
        reject("Error updating client status");
      }
    });
  },

  getCustomerInteraction: async (id) => {
      try {
              const result = await db.get().collection(COLLECTION.CUSTOMER_ACTIVITY).aggregate([
                  { $match: { client_id: ObjectId(id) } },
                  { $sort: { created_at: -1 } },
                  {
                      $lookup: {
                          from: COLLECTION.OFFICERS,
                          localField: "officer_id",
                          foreignField: "_id",
                          as: "officer_details"
                      }
                  },
                  { $unwind: { path: "$officer_details", preserveNullAndEmptyArrays: true } },
                  {
                      $project: {
                          _id: 1,
                          type: 1,
                          client_id: 1,
                          duration: 1,
                          next_schedule: 1,
                          next_shedule_time: 1,
                          comment: 1,
                          call_type: 1,
                          call_status: 1,
                          created_at: 1,
                          officer: {
                              $ifNull: [
                                  {
                                      _id: "$officer_details._id",
                                      name: "$officer_details.name",
                                      email: "$officer_details.email",
                                      phone: "$officer_details.phone",
                                      officer_id: "$officer_details.officer_id",
                                      designation: "$officer_details.designation",
                                      // Add other officer fields you need
                                  },
                                  null
                              ]
                          }
                      }
                  }
              ]).toArray();
  
              return result;
          } catch (err) {
              console.error("Error fetching call logs with officer details:", err);
              throw new Error("Error fetching call logs with officer details");
          }
      },
}