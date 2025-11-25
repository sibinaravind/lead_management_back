var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { leadSchema } = require("../validations/leadValidation");
const validatePartial = require("../utils/validatePartial");
const { logActivity } = require('./customer_interaction_helper');
const { safeObjectId } = require('../utils/safeObjectId');
const fileUploader = require('../utils/fileUploader');
const path = require('path');
var fs = require('fs');
// Helper to get next sequence number
module.exports = {
createLead: async (details) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Only validate and use fields that are present in details
      var { error, value } = leadSchema.validate(details ) ;

      if (error) return reject("Validation failed: " + error.details[0].message);

        value = Object.fromEntries(
        Object.entries(value || {}).filter(([_, v]) =>
          v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "")
        )
      );

      const dbInstance = db.get();
      const leadsCol = dbInstance.collection(COLLECTION.LEADS);
      const officersCol = dbInstance.collection(COLLECTION.OFFICERS);
      // ✅ Check for duplicates
      const collectionsToCheck = [
        leadsCol,
        // dbInstance.collection(COLLECTION.CUSTOMERS),
        // dbInstance.collection(COLLECTION.DEAD_LEADS),
      ];
      for (const col of collectionsToCheck) {
        // const query = value.email?.trim()
        //   ? { $or: [{ email: value.email }, { phone: value.phone }] }
        //   : { phone: value.phone };

            const query = { phone: value.phone };

        const exists = await col.findOne(query);
         if (exists) return reject("Client already exists");
      }
      // ✅ Generate client ID
      const leadIdSeq = await getNextSequence("lead_id");
      const client_id = `AELID${String(leadIdSeq).padStart(5, "0")}`;
      // ✅ Officer assignment
      let assignedOfficer = null;
      if ((!value.officer_id || value.officer_id.trim() === "") && value.service_type) {
        const rrConfig = await dbInstance
          .collection(COLLECTION.ROUNDROBIN)
          .findOne({ name: value.service_type });
         if (rrConfig?.officers?.length > 0) {
          const { value: counter } = await dbInstance
            .collection(COLLECTION.COUNTER)
            .findOneAndUpdate(
              { _id: `lead_roundrobin_${value.service_type}` },
              { $inc: { sequence: 1 } },
              { upsert: true, returnDocument: "after" }
            );
          const officerIndex = (counter.sequence - 1) % rrConfig.officers.length;
          const selectedOfficerId = rrConfig.officers[officerIndex];
          assignedOfficer = await officersCol.findOne(
            { _id: safeObjectId(selectedOfficerId) },
            { projection: { name: 1, officer_id: 1, email: 1, designation: 1, branch: 1 } }
          );
        }
      } else if (value.officer_id) {
        assignedOfficer = await officersCol.findOne(
          { _id: safeObjectId(value.officer_id) },
          { projection: { name: 1, officer_id: 1, email: 1, designation: 1, branch: 1 } }
        );
      }
      // ✅ Insert lead
      value.officer_id = assignedOfficer ? safeObjectId(assignedOfficer._id) : "UNASSIGNED";
      value.status =  assignedOfficer
          ? (value.status !== undefined && value.status !== null && value.status !== "" ? value.status : "NEW")
          : "UNASSIGNED"
      const result = await leadsCol.insertOne({
        client_id,
        ...value,
        created_at: new Date(),
        updated_at: new Date(),
      });
      if (result.acknowledged) {
            if(value.officer_id) //for fix the error when officer_id not settting as ObjectId
            {
                leadsCol.updateOne({ _id: result.insertedId }, { $set: { officer_id: safeObjectId(value.officer_id) } });
            }
            await logActivity({
              type: "customer_created",
              client_id: result.insertedId,
              officer_id: assignedOfficer
                ? safeObjectId(assignedOfficer._id)
                : "UNASSIGNED",
              comment: value.note || "",
            });
        return resolve(result.insertedId);
      } else {
        return reject("Insert failed");
      }

    } catch (err) {
      console.error("Error inserting lead:", err);
      return reject("Error processing request");
    }
  });
  },

  bulkInsertLeads: async (leadsArray) => {
    try {
      if (!Array.isArray(leadsArray) || leadsArray.length === 0) {
        throw new Error("Input must be a non-empty array");
      }
      const dbInstance = db.get();
      const leadsCol = dbInstance.collection(COLLECTION.LEADS);
      const officersCol = dbInstance.collection(COLLECTION.OFFICERS);

      const insertedIds = [];
      for (const details of leadsArray) {
        // Validate each lead
        const { error, value } = leadSchema.validate(details);
        if (error) continue; // Skip invalid leads

        // Remove empty fields
        const cleanValue = Object.fromEntries(
          Object.entries(value || {}).filter(([_, v]) =>
            v !== null && v !== undefined && !(typeof v === "string" && v.trim() === "")
          )
        );
        // Check for duplicates by phone
        const exists = await leadsCol.findOne({ phone: cleanValue.phone });
        if (exists) continue; // Skip duplicates

        // Generate client ID
        const leadIdSeq = await getNextSequence("lead_id");
        const client_id = `AELID${String(leadIdSeq).padStart(5, "0")}`;

        // Officer assignment
        let assignedOfficer = null;
        if ((!cleanValue.officer_id || cleanValue.officer_id.trim() === "") && cleanValue.service_type) {
          const rrConfig = await dbInstance
            .collection(COLLECTION.ROUNDROBIN)
            .findOne({ name: cleanValue.service_type });
          if (rrConfig?.officers?.length > 0) {
            const { value: counter } = await dbInstance
              .collection(COLLECTION.COUNTER)
              .findOneAndUpdate(
                { _id: `lead_roundrobin_${cleanValue.service_type}` },
                { $inc: { sequence: 1 } },
                { upsert: true, returnDocument: "after" }
              );
            const officerIndex = (counter.sequence - 1) % rrConfig.officers.length;
            const selectedOfficerId = rrConfig.officers[officerIndex];
            assignedOfficer = await officersCol.findOne(
              { _id: safeObjectId(selectedOfficerId) },
              { projection: { name: 1, officer_id: 1, email: 1, designation: 1, branch: 1 } }
            );
          }
        } else if (cleanValue.officer_id) {
          assignedOfficer = await officersCol.findOne(
            { _id: safeObjectId(cleanValue.officer_id) },
            { projection: { name: 1, officer_id: 1, email: 1, designation: 1, branch: 1 } }
          );
        }

        cleanValue.officer_id = assignedOfficer ? safeObjectId(assignedOfficer._id) : "UNASSIGNED";
        cleanValue.status = assignedOfficer
          ? (cleanValue.status !== undefined && cleanValue.status !== null && cleanValue.status !== "" ? cleanValue.status : "NEW")
          : "UNASSIGNED";

        const result = await leadsCol.insertOne({
          client_id,
          ...cleanValue,
          created_at: new Date(),
          updated_at: new Date(),
        });

        if (result.acknowledged) {
          if (cleanValue.officer_id) {
            leadsCol.updateOne({ _id: result.insertedId }, { $set: { officer_id: safeObjectId(cleanValue.officer_id) } });
          }
          await logActivity({
            type: "customer_created",
            client_id: result.insertedId,
            officer_id: assignedOfficer ? safeObjectId(assignedOfficer._id) : "UNASSIGNED",
            comment: cleanValue.note || "",
          });
          insertedIds.push(result.insertedId);
        }
      }
      return { success: true, insertedIds };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },


  editLead : async (leadId, updateData) => {
        try {
            // Validate input
            const validatedData = validatePartial(leadSchema, updateData);
            const updateResult = await db.get().collection(COLLECTION.LEADS).updateOne(
            { _id: ObjectId(leadId) },
            { $set: { ...validatedData, updated_at: new Date() } }
            );
            if (updateResult.matchedCount === 0) {
            throw new Error("Lead not found");
            }
            return { success: true, message: "Lead updated successfully" };
        } catch (err) {
            return { success: false, error: err.message };
        }
  },


  uploadClientDocument: (id, { doc_type, base64 }) => {
          let filePath = null;
          console.log("Starting document upload for lead ID:", id);
          return new Promise(async (resolve, reject) => {
              try {
                  if (!doc_type || !base64) {
                      return reject("Missing required fields for document upload.");
                  }
                  const collection = db.get().collection(COLLECTION.LEADS);
                  // 🔍 Check if document with this type already exists
                  const existing = await collection.findOne(
                      { _id: ObjectId(id), "documents.doc_type": doc_type },
                      { projection: { "documents.$": 1 } }
                  );

                  let oldFilePath = null;
                  if (existing?.documents?.[0]?.file_path) {
                      oldFilePath = existing.documents[0].file_path;
                  }
  
                  // 📂 Save the new file
                  filePath = await fileUploader.processAndStoreBase64File({
                      base64Data: base64,
                      originalName: doc_type,
                      clientName: `client_${id}`,
                      uploadsDir: "uploads/client_documents"
                  });
  
                  let updateResult;
  
                  if (existing) {
                      // 📝 Update existing document
                      updateResult = await collection.updateOne(
                          { _id: ObjectId(id), "documents.doc_type": doc_type },
                          {
                              $set: {
                                  "documents.$.file_path": filePath,
                                  "documents.$.uploaded_at": new Date(),
                                  updated_at: new Date()
                              }
                          }
                      );
                  } else {
                    console.log("Adding new document entry for doc_type:", doc_type);
                      // ➕ Add new document entry if it doesn't exist
                      updateResult = await collection.updateOne(
                          { _id: ObjectId(id) },
                          {
                              $push: {
                                  documents: {
                                      doc_type,
                                      file_path: filePath,
                                      uploaded_at: new Date()
                                  }
                              },
                              $set: { updated_at: new Date() }
                          }
                      );
                  }
  
                  console.log("Update Result:", updateResult);
  
                  if (updateResult.matchedCount === 0) {
                      // Rollback uploaded file if DB update fails
                      if (filePath) {
                          await fs.promises.unlink(path.resolve(filePath)).catch(() => { });
                      }
                      return reject(`Failed to update or add document for "${doc_type}".`);
                  }
  
                  // 🗑️ Remove old file if replaced
                  if (oldFilePath) {
                      await fs.promises.unlink(path.resolve(oldFilePath)).catch((err) => {
                          console.warn("Failed to remove old file:", err.message);
                      });
                  }
  
                  resolve({ success: true, file_path: filePath });
              } catch (err) {
                  console.log("Error occurred while uploading document:", err);
                  // Rollback uploaded file if error
                  if (filePath) {
                      await fs.promises.unlink(path.resolve(filePath)).catch(() => { });
                  }
                  reject("Error uploading document: " + (err.message || err));
              }
          });
      },
    // Get all leads/clients with flexible filtering
  getAllLeads: async (filters) => {
        return new Promise(async (resolve, reject) => {
            try {   
                // Project only basic information
                const LEADS = await db.get().collection(COLLECTION.LEADS).find().project( {
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
                }).toArray();
                resolve(LEADS);
            } catch (err) {
                reject("Error fetching LEADS");
            }
        });
    },

    getLeadDetails: async (leadId) => {
      try {
        const lead = await db.get().collection(COLLECTION.LEADS).findOne({ _id: ObjectId(leadId) });
        if (!lead) throw new Error("Lead not found");
        return lead;
      } catch (err) {
        throw new Error("Error fetching lead details");
      }
    },

    searchLead: async (query) => {
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
          const [leads] = await Promise.all([
            db.get().collection(COLLECTION.LEADS).find(searchQuery, { projection }).toArray(),
         
          ]);
    
          // Combine and return all results
          return [...leads];
        } catch (err) {
          console.error("Error searching customer:", err);
          throw new Error("Error searching customer");
        }
      },


      getLeadInteraction: async (id) => {
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
                                referrer_id: 1,
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


     assignOfficerToLead: async (clientId, officerId, comment, assignedby) => {
        return new Promise(async (resolve, reject) => {
          try {
            if (!clientId || !officerId) {
              return reject("Client ID and Officer ID are required");
            }
            const clientObjectId = new ObjectId(clientId);
            const officerObjectId = new ObjectId(officerId);
            const leadsCollection = db.get().collection(COLLECTION.LEADS);
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

            // Try updating in LEADS collection
            let updateResult = await leadsCollection.findOneAndUpdate(
              { _id: clientObjectId },
              { $set: {
              officer_id: officerObjectId
             } }  ,
              { returnDocument: 'after' }
            );
           
            if (!updateResult.value) {
              return reject("Client not found in  LEADS");
            }
            await logActivity({
              type: 'assign_officer',
              client_id: clientObjectId,
              assigned_by: assignedby,
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
    
     

    addProductInterested: async (leadId, productData ,officer_id) => {
      try {
        const leadsCol = db.get().collection(COLLECTION.LEADS);
        // Check if product already exists for this lead
        const lead = await leadsCol.findOne({ _id: ObjectId(leadId) });
        if (!lead) throw new Error("Lead not found");
        let updateQuery;
        const existingProduct = (lead.product_interested || []).find(
          p => p.product_id === productData.product_id
        );
        if (existingProduct) {
          updateQuery = {
            $push: {
              "product_interested.$[prod].offers": { ...productData.offers[0] }
            }
          };
          const arrayFilters = [{ "prod.product_id": productData.product_id }];
          await leadsCol.updateOne(
            { _id: ObjectId(leadId) },
            updateQuery,
            { arrayFilters }
          );
        } else {
          // If product not exists, add new product_interested entry
          await leadsCol.updateOne(
            { _id: ObjectId(leadId) },
            {
              $push: {
                product_interested: {
                  product_id: productData.product_id,
                  product_name: productData.product_name,
                  offers: productData.offers
                }
              }
            }
          );
        }
        logActivity({
            type: "showed_product_interest",
            client_id:safeObjectId(lead._id),
            officer_id: officer_id ? safeObjectId(officer_id) : "UNASSIGNED",
            referrer_id:safeObjectId(productData.product_id),
            comment:" Interested in product: " + productData.product_name + " , offered: " + (productData.offers[0]?.offer_price || "") + " Negotiating to " + (productData.offers[0]?.demanding_price || ""),
            
        });

        return { success: true, message: "Product interested updated" };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },



    

    // db.leads.createIndex({ officer_id: 1 }); //tst add index to all  primary fields
    // db.leads.createIndex({ status: 1 });
    // db.leads.createIndex({ service_type: 1 });
    // db.leads.createIndex({ created_at: -1 });

   getLeadCountByCategory: async (decoded, query) => { // will show count of leads based on categories like all, new, today, tomorrow, Negotiating ,upcoming, unallocated, dead , converted
        const {  employee } = query;
        try {
          const isAdmin = Array.isArray(decoded?.designation) && decoded.designation.includes("ADMIN");
          const filter = {};
           if (employee) {
          
              filter.officer_id = safeObjectId(employee);
           } else if (!isAdmin) {
             filter.officer_id = Array.isArray(decoded?.officers)
              ? decoded.officers.map(o => safeObjectId(o?.officer_id)).filter(Boolean)
              : [];
           }else if (isAdmin) {
                const officerList = await db.get().collection(COLLECTION.OFFICERS)
                    .find() 
                    .project({ _id: 1 })
                    .toArray();
                  const officerIds = officerList.map(officer => officer._id);
                  filter.officer_id = { $in: officerIds };
 
        }
        // console.log("Filter for lead count:", filter);
            // if (isAdmin) return {};
            // const ids = [safeObjectId(decoded?._id), ...officerIds].filter(Boolean);
            // console.log("Officer IDs for filter:", ids);
            // filter.officer_id = { $in: ids };

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(today.getDate() + 1);
          const dayAfterTomorrow = new Date(tomorrow);
          dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
          const dateField = "lastcall.next_schedule";
          const leadResult = await  db.get().collection(COLLECTION.LEADS).aggregate( [
            { $match: filter },
            {
              $facet: {
                TOTAL: [{ $count: "count" }],
                NEW: [{ $match: { status: "HOT" } }, { $count: "count" }],
                UNASSIGNED: [{ $match: { status: "UNASSIGNED" } }, { $count: "count" }],
                NEGOTIATING: [{ $match: { status: "NEGOTIATING" } }, { $count: "count" }],
                DEAD: [{ $match: { status: "DEAD" } }, { $count: "count" }],
                CONVERTED: [{ $match: { status: "CONVERTED" } }, { $count: "count" }],
                TODAY: [{
                  $match: {
                    [dateField]: { $gte: today, $lt: tomorrow }
                  }
                }, { $count: "count" }],
                TOMORROW: [{
                  $match: {
                    [dateField]: { $gte: tomorrow, $lt: dayAfterTomorrow }
                  }
                }, { $count: "count" }],
                UPCOMING: [{
                  $match: {
                    [dateField]: { $gte: dayAfterTomorrow }
                  }
                }, { $count: "count" }],
                PENDING: [{
                  $match: {
                    [dateField]: { $lt: today }
                  }
                }, { $count: "count" }]
              }
            }
          ]).toArray();
          // console.log("Lead count result:", leadResult);
          const counts = leadResult[0] || {};
          const getCountVal = (key) => (counts[key]?.[0]?.count ?? 0);
          // ✅ Replace expensive distinct with fast countDocuments
          // const historyCount = await db.get().collection(COLLECTION.CALL_LOG_ACTIVITY).countDocuments({
          //   created_at: { $gte: today, $lt: tomorrow },
          //   ...filter
          // });
          return {
            TOTAL: getCountVal("TOTAL"),
            NEW: getCountVal("NEW"),
            TODAY: getCountVal("TODAY"),
            TOMORROW: getCountVal("TOMORROW"),
            UPCOMING: getCountVal("UPCOMING"),
            PENDING: getCountVal("PENDING"),
            UNASSIGNED: getCountVal("UNASSIGNED"),
            NEGOTIATING: getCountVal("NEGOTIATING"),
            DEAD: getCountVal("DEAD"),
            CONVERTED: getCountVal("CONVERTED"),
            // HISTORY: historyCount
          };
        } catch (err) {
          console.error("getLeadCountByCategory error:", err);
          throw new Error("Server Error");
        }
  },

  getFilteredLeads: async (query, decoded) => { //  all, new, today, tomorrow, Negotiating ,upcoming, unallocated, dead , converted
        try {
          const {
            filterCategory,
            page = 1,
            limit = 10,
            status,
            branch,
            employee,
            serviceType,
            intrestedIn,
            leadSource,
            campagin,
            startDate,
            endDate,
            searchString,
          } = query;
          const parsedPage = parseInt(page);
          const parsedLimit = parseInt(limit);
          const skip = (parsedPage - 1) * parsedLimit;
          const filter = {};
          // Officer filtering
          const isAdmin = Array.isArray(decoded?.designation) && decoded.designation.includes('ADMIN');
          let officerIdList = [];
          if (!isAdmin) {
            officerIdList = Array.isArray(decoded?.officers)
              ? decoded.officers.map(o => safeObjectId(o?.officer_id)).filter(Boolean)
              : [];
          }
        if (filterCategory === 'UNASSIGNED') {
            filter.officer_id = 'UNASSIGNED';
          } else if (employee) {
              filter.officer_id = safeObjectId(employee);
          } else if (isAdmin) {
                  const officerList = await db.get().collection(COLLECTION.OFFICERS)
                    .find() // works if designation is an array
                    .project({ _id: 1 })
                    .toArray();
                  const officerIds = officerList.map(officer => officer._id);
                  filter.officer_id = { $in: officerIds };
          } else if (officerIdList.length > 0) {
             filter.officer_id = { $in: [safeObjectId(decoded?._id), ...officerIdList] };
          } else {
             filter.officer_id = safeObjectId(decoded?._id);
          }
           if (['NEW', 'CONVERTED', 'DEAD', 'NEGOTIATING'].includes(filterCategory)) { 
             filter.status = filterCategory;
           }
           else if(status)
           {
            filter.status = status;
           }
          // Additional filters
          if (branch) filter.branch = branch;
          if (serviceType) filter.service_type = serviceType;
          if (intrestedIn) filter.interested_in = { $in: Array.isArray(intrestedIn) ? intrestedIn : [intrestedIn] };
          if (leadSource) filter.lead_source = leadSource;
          if (campagin) filter.source_campaign = campagin;

          // Date filters: created_at or lastcall.next_schedule

          let dateField = 'created_at';
          let start = null;
          let end = null;
          const parseDate = (str) => {
          if (!str) return null;
          const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
          if (match) {
            return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
          }
          return new Date(str);
        };
          // Override for filterCategory
          if (['TODAY', 'TOMORROW', 'PENDING', 'UPCOMING'].includes(filterCategory)) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            const dayAfterTomorrow = new Date(tomorrow);
            dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
            dateField = 'lastcall.next_schedule';
            if (filterCategory === 'TODAY') {
              start = new Date(today);
              end = new Date(tomorrow);
              end.setMilliseconds(-1);
            } else if (filterCategory === 'TOMORROW') {
              start = new Date(tomorrow);
              end = new Date(dayAfterTomorrow);
              end.setMilliseconds(-1);
            } else if (filterCategory === 'PENDING') {
                start = startDate ? parseDate(startDate) : null;
                end = endDate ? parseDate(endDate) : new Date(today);
                if (end && !isNaN(end)) {
                  end.setHours(23, 59, 59, 999);
                }
            } else if (filterCategory === 'UPCOMING') {
                start = startDate ? parseDate(startDate) : new Date(dayAfterTomorrow);
                end = endDate ? parseDate(endDate) : null;
                if (end && !isNaN(end)) {
                  end.setHours(23, 59, 59, 999);
                }
            }
          } else if (startDate || endDate) {
            // Parse date from DD/MM/YYYY or ISO
            start = startDate ? parseDate(startDate) : null;
            end = endDate ? parseDate(endDate) : null;
            if (end && !isNaN(end)) end.setHours(23, 59, 59, 999);
          }

          if (start || end) {
            filter[dateField] = {};
            if (start && !isNaN(start)) filter[dateField].$gte = start;
            if (end && !isNaN(end)) filter[dateField].$lte = end;
            // Cleanup if empty
            if (Object.keys(filter[dateField]).length === 0) {
              delete filter[dateField];
            }
          }

          // Search text match
          if (searchString) {
            const searchRegex = new RegExp(searchString, "i");
            filter.$or = [
              { phone: { $regex: searchRegex } },
              { name: { $regex: searchRegex } },
              { client_id: { $regex: searchRegex } },
              { email: { $regex: searchRegex } }
            ];
          }

          const leadsCollection = db.get().collection(COLLECTION.LEADS);

          const result = await leadsCollection.aggregate([
            { $match: filter },
            {
              $facet: {
                data: [
                  { $sort: { created_at: -1 } },
                  { $skip: skip },
                  { $limit: parsedLimit },
                  {
                    $lookup: {
                      from: COLLECTION.OFFICERS,
                      localField: "officer_id",
                      foreignField: "_id",
                      as: "officer",
                    },
                  },
                  {
                    $unwind: {
                      path: "$officer",
                      preserveNullAndEmptyArrays: true,
                    },
                  },
                  {
                    $project: {
                      _id: 1,
                      client_id: 1,
                      name: 1,
                      email: 1,
                      phone: 1,
                      branch: 1,
                      service_type: 1,
                      country_code: 1,
                      status: 1,
                      lead_source: 1,
                      interested_in: 1,
                      next_schedule: "$lastcall.next_schedule",
                      last_call_comment: "$lastcall.comment",
                      feedback:1,
                      created_at: 1,
                      officer_id: 1,
                      officer_name: "$officer.name",
                      officer_staff_id: "$officer.officer_id",
                      dead_lead_reason: 1,
                      source_campaign: 1,
                      // lastcall: 0 // Optional: expose if needed for frontend
                    },
                  },
                ],
                totalCount: [
                  { $count: "count" },
                ],
              },
            },
          ]).toArray();

          const leadsData = result[0]?.data || [];
          const totalCount = result[0]?.totalCount?.[0]?.count || 0;

          return {
            leads: leadsData,
            limit: parsedLimit,
            page: parsedPage,
            totalMatch: totalCount,
            totalPages: Math.ceil(totalCount / parsedLimit),
          };

        } catch (error) {
          throw new Error('Server Error');
        }
  },  

   getCallHistoryWithFilters: async (query, decoded, ) => { // will setup total calls made on today, yesterday, calender select
        try {
          const {
            page = 1,
            limit = 10,
            callType,
            callStatus,
            employee,
            startDate,
            endDate,
            searchString,
            status,
          } = query;

          const parsedPage = parseInt(page);
          const parsedLimit = parseInt(limit);
          const skip = (parsedPage - 1) * parsedLimit;
          const isAdmin = Array.isArray(decoded?.designation) && decoded.designation.includes("ADMIN");
          let officerIdList = [];
          if (!isAdmin) {
            officerIdList = Array.isArray(decoded?.officers)
              ? decoded.officers.map(o => safeObjectId(o?.officer_id)).filter(Boolean)
              : [];
          }
           const filter = { };
          // Officer filtering
          if (employee) {
            filter.officer_id = safeObjectId(employee);
          } else if (!isAdmin) {
            if (officerIdList.length > 0) {
              filter.officer_id = { $in: [safeObjectId(decoded?._id), ...officerIdList] };
            } else {
              filter.officer_id = safeObjectId(decoded?._id);
            }
          }else if (isAdmin) {
                const officerList = await db.get().collection(COLLECTION.OFFICERS)
                    .find() // works if designation is an array
                    .project({ _id: 1 })
                    .toArray();
                  const officerIds = officerList.map(officer => officer._id);
                  filter.officer_id = { $in: officerIds };
          }
          // Additional filters
          if (callType) filter.call_type = callType;
          if (callStatus) filter.call_status = callStatus;
           
          // Date range filtering
          if (startDate || endDate) {
            const parseDate = (str) => {
              if (!str) return null;
              const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
              if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
              return new Date(str);
            };

            filter.created_at = {};
            if (startDate) {
              const start = parseDate(startDate);
              if (!isNaN(start)) filter.created_at.$gte = start;
            }
            if (endDate) {
              const end = parseDate(endDate);
              if (!isNaN(end)) {
                end.setHours(23, 59, 59, 999);
                filter.created_at.$lte = end;
              }
            }
          }

        const callLogCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);
       const result = await callLogCollection.aggregate([
        { $match: filter },
        {
          $facet: {
            data: [
              { $sort: { created_at: -1 } },
              { $skip: skip },
              { $limit: parsedLimit },

              // Lookup Officer Details
              {
                $lookup: {
                  from: COLLECTION.OFFICERS,
                  localField: "officer_id",
                  foreignField: "_id",
                  as: "officer"
                }
              },
              {
                $unwind: {
                  path: "$officer",
                  preserveNullAndEmptyArrays: true
                }
              },

              // Lookup Client Details
                {
                $lookup: {
                  from: COLLECTION.LEADS,
                  localField: "client_id",
                  foreignField: "_id", // Assuming client_id is an ObjectId
                    pipeline: [
                    //for status
                    ...(status
                      ? [{ $match: { status: status } }]
                      : []
                    ),
                    //for search
                    ...(searchString
                      ? [{
                        $match: {
                        $or: [
                          { phone: { $regex: new RegExp(searchString, 'i') } },
                          { client_id: { $regex: new RegExp(searchString, 'i') } }
                        ]
                        }
                      }]
                      : []
                    )
                    ],
                    as: "client"
                    }
                    },
                    {
                    $unwind: {
                    path: "$client",
                    preserveNullAndEmptyArrays: false
                    }
                    },
               

              // Final Project
              {
                $project: {
                  _id:"$client._id",
                  type: 1,
                  client_id: "$client.client_id",
                  officer_id: 1,
                  recruiter_id: 1,
                  duration: 1,
                  next_schedule: 1,
                  comment: 1,
                  call_type: 1,
                  call_status: 1,
                  created_at: 1,
                  // Officer Info
                  officer_name: "$officer.name",
                  officer_staff_id: "$officer.officer_id",
                  officer_email: "$officer.email",
                  // Client Info
                  name: "$client.name",
                  email: "$client.email",
                  phone: "$client.phone",
                  status: "$client.status",
                  branch: "$client.branch",
                  lead_source: "$client.lead_source",
                  service_type: "$client.service_type",
                  interested_in: "$client.interested_in",
                }
              }
            ],
                // Total count (for pagination)
                totalCount: [{ $count: "count" }]
              }
            }
          ]).toArray();
          const callData = result[0]?.data || [];
          const totalCount = result[0]?.totalCount?.[0]?.count || 0;

          return {
            leads: callData,
            limit: parsedLimit,
            page: parsedPage,
            totalMatch: totalCount,
            totalPages: Math.ceil(totalCount / parsedLimit),
          };

        } catch (err) {
          console.error("getCallHistoryWithFilters error:", err);
          throw new Error("Server Error");
        }
    },
    // Get lead/client by ID
  
}




  // restoreClientFromDeadAndAssignOfficer: async (deadClientId, officerId = null,comment) => {
  //   return new Promise(async (resolve, reject) => {
  //       try {
  //           const deadCustomersCollection = db.get().collection(COLLECTION.DEAD_LEADS);
  //           const customersCollection = db.get().collection(COLLECTION.LEADS);
  //           const officersCollection = db.get().collection(COLLECTION.OFFICERS);
  //           // 1. Fetch the dead client
  //           const deadClient = await deadCustomersCollection.findOne({ _id: new ObjectId(deadClientId) });
  //           if (!deadClient) return reject("Dead client not found");
  //           // 2. Prepare client for restoration
  //           deadClient.status = 'FOLLOWUP';
  //           deadClient.updated_at = new Date();
  //           // 3. Optional: Assign officer info if officerId is provided
  //           let officerObjectId = null;
  //           if (officerId) {
  //               const officer = await officersCollection.findOne(
  //                   { _id: new ObjectId(officerId) },
  //                   { projection: { _id: 1, designation: 1 } }
  //               );

  //               if (officer) {
  //                   officerObjectId = new ObjectId(officer._id);
  //                   deadClient.officer_id = officerObjectId;
  //                    if (
  //                           officer != null &&
  //                           Array.isArray(officer.designation) &&
  //                           officer.designation.includes(DESIGNATIONS.COUNSILOR)
  //                   )
  //                   {
  //                       deadClient.recruiter_id = officerObjectId;
  //                   }
  //               }
  //           }

  //           // 4. Insert back to LEADS
  //           const insertResult = await customersCollection.insertOne(deadClient);
  //           if (!insertResult.acknowledged) return reject("Failed to restore client");

  //           // 5. Delete from DEAD_LEADS
  //           await deadCustomersCollection.deleteOne({ _id: new ObjectId(deadClientId) });

  //           // 6. Log activity
  //           // await activityCollection.insertOne({
  //           //     type: 'client_restored',
  //           //     client_id:ObjectId( deadClient._id),
  //           //     recruiter_id :ObjectId(deadClient.recruiter_id ) || null,
  //           //     officer_id:ObjectId (deadClient.officer_id || null), // Can be null
  //           //     created_at: new Date(),
  //           //     note: comment
  //           // });

  //           logActivity({   
  //               type: 'client_restored',
  //               client_id: insertResult.insertedId,
  //               recruiter_id: deadClient.recruiter_id || null,
  //               officer_id: officerObjectId || null,
  //               comment: comment || '',
  //           });

  //           resolve("Client restored successfully");

  //       } catch (err) {
  //           console.error(err);
  //           reject("Error restoring client");
  //       }
  //   });
  // },



   // getFilteredLeads: async (query, decoded) => {
    //     try {
    //       const {
    //         filterCategory,
    //         page = 1,
    //         limit = 10,
    //         status,
    //         branch,
    //         employee,
    //         serviceType,
    //         profession,
    //         leadSource,
    //         campagin,
    //         startDate,
    //         endDate,
    //         searchString
    //       } = query;

    //       const parsedPage = parseInt(page);
    //       const parsedLimit = parseInt(limit);
    //       const skip = (parsedPage - 1) * parsedLimit;
    //       const filter = {};
    //       // Officer filtering
    //       const isAdmin = Array.isArray(decoded?.designation) && decoded.designation.includes('ADMIN');
    //       let officerIdList = [];

    //       if (!isAdmin) {
    //         officerIdList = Array.isArray(decoded?.officers)
    //           ? decoded.officers.map(o => safeObjectId(o?.officer_id)).filter(Boolean)
    //           : [];
    //       }
    //       if (filterCategory === 'UNASSIGNED') {
    //           filter.officer_id = 'UNASSIGNED';
    //       }
    //       else if (employee) {
    //           filter.officer_id = safeObjectId(employee);
    //       } else if (isAdmin) {
    //         // Admins see all
    //       } else if (officerIdList.length > 0) {
    //         filter.officer_id = { $in: [safeObjectId(decoded?._id), ...officerIdList] };
    //       } else {
    //         filter.officer_id = safeObjectId(decoded?._id);
    //       } 
    //       if(filterCategory === 'NEW')
    //         {
    //           filter.status = "HOT"
    //         }
    //         else if (status)
    //         { filter.status = status;
    //       }
    //       // Apply additional filters
    //       if (branch) filter.branch = branch;
    //       if (serviceType) filter.service_type = serviceType;
    //       if (profession) filter.profession = profession;
    //       if (leadSource) filter.lead_source = leadSource;
    //       if(campagin) filter.campagin = campagin;
    //       if (startDate || endDate) {
    //         // Support DD/MM/YYYY format as well as ISO
    //         const parseDate = (str) => {
    //           if (!str) return null;
    //           // Try DD/MM/YYYY
    //           const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(str);
    //           if (match) {
    //           // month is 0-based in JS Date
    //           return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    //           }
    //           // fallback to Date parse
    //           return new Date(str);
    //         };

    //         filter.created_at = {};
    //         if (startDate) {
    //           const start = parseDate(startDate);
    //           if (!isNaN(start)) filter.created_at.$gte = start;
    //         }
    //         if (endDate) {
    //           const end = parseDate(endDate);
    //           if (!isNaN(end)) {
    //           end.setHours(23, 59, 59, 999);
    //           filter.created_at.$lte = end;
    //           }
    //         }
    //       }
    //       if (searchString) {
    //         const searchRegex = new RegExp(searchString, "i");
    //         filter.$or = [
    //           { phone: { $regex: searchRegex } },
    //           { name: { $regex: searchRegex } },
    //           { client_id: { $regex: searchRegex } },
    //           { email: { $regex: searchRegex } }
    //         ];
    //         }
    //       const leadsCollection = db.get().collection(COLLECTION.LEADS);
    //       const result = await leadsCollection.aggregate([
    //         { $match: filter },
    //         {
    //           $facet: {
    //             data: [
    //               { $sort: { created_at: -1 } },
    //               { $skip: skip },
    //               { $limit: parsedLimit },
    //               {
    //                 $lookup: {
    //                   from: COLLECTION.OFFICERS,
    //                   localField: "officer_id",
    //                   foreignField: "_id",
    //                   as: "officer",
    //                 },
    //               },
    //               {
    //                 $unwind: {
    //                   path: "$officer",
    //                   preserveNullAndEmptyArrays: true,
    //                 },
    //               },
    //               {
    //                 $project: {
    //                   _id: 1,
    //                   client_id: 1,
    //                   name: 1,
    //                   email: 1,
    //                   phone: 1,
    //                   branch: 1,
    //                   service_type: 1,
    //                   country_code: 1,
    //                   status: 1,
    //                   lead_source: 1,
    //                   created_at: 1,
    //                   officer_id: 1,
    //                   officer_name: "$officer.name",
    //                   officer_staff_id: "$officer.officer_id",
    //                 },
    //               },
    //             ],
    //             totalCount: [
    //               { $count: "count" },
    //             ],
    //           },
    //         },
    //       ]).toArray();

    //       const leadsData = result[0]?.data || [];
    //       const totalCount = result[0]?.totalCount?.[0]?.count || 0;

    //       return {
    //         leads: leadsData,
    //         limit: parsedLimit,
    //         page: parsedPage,
    //         totalMatch: totalCount,
    //         totalPages: Math.ceil(totalCount / parsedLimit),
    //       };

    //     } catch (error) {
    //       console.error('getFilteredLeads error:', error);
    //       throw new Error('Server Error');
    //     }
    // },


    // Create Client/Lead
    // createLead: async (details) => {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             const collection = db.get().collection(COLLECTION.LEADS);
    //             const officersCollection = db.get().collection(COLLECTION.OFFICERS);
    //             // await collection.createIndex({ client_id: 1, phone : 1 }, { unique: true }); //req
    //             // await collection(COLLECTION.CUSTOMERS).createIndex({ client_id: 1, phone : 1 }, { unique: true }); //req
    //             // Check for duplicate client (by email or phone)
    //            const collectionsToCheck = [
    //                 collection, // already holds db.get().collection(COLLECTION.CLIENTS)
    //                 db.get().collection(COLLECTION.CUSTOMERS),
    //                 db.get().collection(COLLECTION.DEAD_LEADS)
    //                 ];

    //                 let existingClient = null;

    //                 for (const col of collectionsToCheck) {
    //                 existingClient = await col.findOne({
    //                     $or: [
    //                     { email: details.email },
    //                     { phone: details.phone }
    //                     ]
    //                 });

    //                 if (existingClient) break;
    //                 }

    //         if (existingClient) return reject("Client already exists with this email or phone");
    //             // Get next client number atomically
    //             const newNumber = await getNextSequence('lead_id');
    //             const client_id = `AELID${String(newNumber).padStart(5, '0')}`;
    //             // Handle automatic round-robin assignment if no officer_id is provided
    //             if (!details.officer_id) {
    //                 const officers = await officersCollection.find({
    //                     designation: { $in: [4,5] }
    //                 }).toArray();
    //                 if (officers.length > 0) {
    //                     // Get the counter collection
    //                     const counterCollection = db.get().collection(COLLECTION.COUNTER);

    //                     // First get current counter and update it atomically
    //                     const updateResult = await counterCollection.findOneAndUpdate(
    //                         { _id: 'lead_roundrobin' },
    //                         { $inc: { sequence: 1 } },
    //                         { upsert: true, returnDocument: 'after' }
    //                     );

    //                     // Calculate the officer index based on the updated sequence
    //                     const officerIndex = ( updateResult.value.sequence - 1) % officers.length;
    //                     // Assign the selected officer
    //                     details.officer_id = officers[officerIndex]._id.toString();

    //                     // Get officer details
    //                     const assignedOfficer = officers[officerIndex];
    //                     details.assigned_officer_details = {
    //                         _id: ObjectId(assignedOfficer._id),
    //                         officer_id: assignedOfficer.officer_id,
    //                         name: assignedOfficer.name,
    //                         email: assignedOfficer.email,
    //                         designation: assignedOfficer.designation || 'Officer'
    //                     };
    //                 }
    //             } else {
    //                 // If officer_id already exists, get the basic details of the officer
    //                 const assignedOfficer = await officersCollection.findOne(
    //                     { officer_id: details.officer_id },
    //                     { projection: {name:1 ,officer_id:1 ,email: 1, designation: 1 } }
    //                 );

    //                 if (assignedOfficer) {
    //                     details.assigned_officer_details = {
    //                         _id: ObjectId(assignedOfficer._id),
    //                         officer_id: assignedOfficer.officer_id,
    //                         name: assignedOfficer.name ,
    //                         email: assignedOfficer.email,
    //                         designation: assignedOfficer.designation || 'Officer'
    //                     };
    //                 }
    //             }

    //             const isOfficerAssigned = details.assigned_officer_details && details.assigned_officer_details._id;
    //             const assignedToValue = isOfficerAssigned ? ObjectId(details.assigned_officer_details._id) : 'UNASSIGNED';
    //             let recruiterIdValue = 'UNASSIGNED';
    //             if (
    //                 isOfficerAssigned &&
    //                 Array.isArray(details.assigned_officer_details.designation) &&
    //                 (details.assigned_officer_details.designation.includes(4) || details.assigned_officer_details.designation.includes(5))
    //             ) {
    //                 recruiterIdValue = ObjectId(details.assigned_officer_details._id);
    //             }
    //             const statusValue = isOfficerAssigned ? (details.status || 'HOT') : 'UNASSIGNED';
    //             const result = await collection.insertOne({ // test add inital job add date  
    //                 client_id: client_id,
    //                 name: details.name,
    //                 email: details.email,
    //                 phone: details.phone,
    //                 country_code:details.country_code || null,
    //                 alternate_phone: details.alternate_phone || null,
    //                 whatsapp: details.whatsapp || null,
    //                 gender: details.gender || null,
    //                 dob: details.dob || null ,
    //                 matrial_status: details.matrial_status || null,
    //                 address: details.address || null,
    //                 city: details.city || null,
    //                 state: details.state || null,
    //                 country: details.country || null,
    //                 job_interests: details.job_interests || [],
    //                 country_interested: details.country_interested || [],
    //                 expected_salary: details.expected_salary || null,
    //                 qualification: details.qualification || null,
    //                 university: details.university || null,
    //                 passing_year: details.passing_year || null,
    //                 experience: details.experience || null,
    //                 skills: details.skills || [],
    //                 profession: details.profession || null,
    //                 specialized_in: details.specialized_in || null,
    //                 lead_source: details.lead_source || 'direct',
    //                 notes: details.notes || '',
    //                 officer_id: assignedToValue,
    //                 branch_name: details.branch_name || '',
    //                 service_type: details.service_type || '',
    //                 recruiter_id: recruiterIdValue,
    //                 status:statusValue,    
    //                 on_call_communication: details.on_call_communication || false, 
    //                 on_whatsapp_communication: details.on_whatsapp_communication || false,
    //                 on_email_communication: details.on_email_communication || false,   
    //                 created_at: new Date()
    //             });
    //             if (result.acknowledged) {
    //                 try {
    //                     const eventsCollection = db.get().collection(COLLECTION.CUSTOMER_ACTIVITY);
    //                     await eventsCollection.insertOne({
    //                         type: 'customer_created',
    //                         client_id: result.insertedId,
    //                         officer_id: details.assigned_officer_details != null ? details.assigned_officer_details._id : 'UNASSIGNED',
    //                         comment:details.notes || '',
    //                         created_at: new Date(),
                           
    //                     });
    //                 } catch (eventErr) {
    //                     console.error("Failed to log customer creation event:", eventErr);
    //                 }
    //                 return resolve(result.insertedId);
    //             } else {
    //                 reject("Insert failed");
    //             }
    //         } catch (err) {
    //             console.log(err);
    //             reject("Error processing request");
    //         }
    //     });
    // },



// var db = require('../config/connection');
// let COLLECTION = require('../config/collections')
// const { ObjectId } = require('mongodb');
// const e = require('express');
// const getNextSequence = require('../utils/get_next_unique').getNextSequence;

// // Helper to get next sequence number

// module.exports = {
//     // Create Client/Lead
//     createCustomer: async (details) => {
//         return new Promise(async (resolve, reject) => {
//             try {
//                 const collection = db.get().collection(COLLECTION.LEADS);
//                 const officersCollection = db.get().collection(COLLECTION.OFFICERS);
//                 // await collection.createIndex({ client_id: 1 }, { unique: true });

//                 // // Check for duplicate client (by email or phone)
//                 // const existingClient = await collection.findOne({
//                 //     $or: [
//                 //         { email: details.email },
//                 //         { phone: details.phone }
//                 //     ]
//                 // });
//                 // if (existingClient) return reject("Client already exists with this email or phone");

//                 // Get next client number atomically
//                 const newNumber = await getNextSequence('customer_id');
//                 const client_id = `AECID${String(newNumber).padStart(5, '0')}`;
//                 // Handle automatic round-robin assignment if no officer_id is provided
//                 console.log("Client ID generated:", client_id);
//                 if (!details.officer_id) {
//                     const officers = await officersCollection.find({ round_robin: true, designation: { $regex: '^counsilor$', $options: '' } }).toArray();
//                     console.log("Officers for round-robin assignment:", officers);
//                     if (officers.length > 0) {
//                         // Get the counter collection
//                         const counterCollection = db.get().collection(COLLECTION.COUNTER);

//                         // First get current counter and update it atomically
//                         const updateResult = await counterCollection.findOneAndUpdate(
//                             { _id: 'lead_roundrobin' },
//                             { $inc: { sequence: 1 } },
//                             { upsert: true, returnDocument: 'after' }
//                         );

//                         // Calculate the officer index based on the updated sequence
//                         const officerIndex = ( updateResult.value.sequence - 1) % officers.length;
//                         // Assign the selected officer
//                         details.officer_id = officers[officerIndex]._id.toString();

//                         // Get officer details
//                         const assignedOfficer = officers[officerIndex];
//                         details.assigned_officer_details = {
//                             _id: ObjectId(assignedOfficer._id),
//                             officer_id: assignedOfficer.officer_id,
//                             name: assignedOfficer.first_name + ' ' + assignedOfficer.last_name,
//                             email: assignedOfficer.email,
//                             designation: assignedOfficer.designation || 'Officer'
//                         };
//                     }
//                 } else {
//                     // If officer_id already exists, get the basic details of the officer
//                     const assignedOfficer = await officersCollection.findOne(
//                         { _id: new ObjectId(details.officer_id) },
//                         { projection: { first_name: 1,last_name:1,officer_id:1 ,email: 1, designation: 1 } }
//                     );

//                     if (assignedOfficer) {
//                         details.assigned_officer_details = {
//                             _id: ObjectId(assignedOfficer._id),
//                             officer_id: assignedOfficer.officer_id,
//                             name: assignedOfficer.first_name + ' ' + assignedOfficer.last_name,
//                             email: assignedOfficer.email,
//                             designation: assignedOfficer.designation || 'Officer'
//                         };
//                     }
//                 }

//                 const result = await collection.insertOne({ // test add inital job add date  
//                     client_id: client_id,
//                     name: details.name,
//                     email: details.email,
//                     phone: details.phone,
//                     alternate_phone: details.alternate_phone || null,
//                     whatsapp: details.whatsapp || null,
//                     gender: details.gender || null,
//                     dob: details.dob || null ,
//                     matrial_status: details.matrial_status || null,
//                     address: details.address || null,
//                     city: details.city || null,
//                     state: details.state || null,
//                     country: details.country || null,
//                     job_interests: details.job_interests || [],
//                     country_interested: details.country_interested || [],
//                     expected_salary: details.expected_salary || null,
//                     qualification: details.qualification || null,
//                     university: details.university || null,
//                     passing_year: details.passing_year || null,
//                     experience: details.experience || null,
//                     skills: details.skills || [],
//                     profession: details.profession || null,
//                     specialized_in: details.specialized_in || null,
//                     lead_source: details.lead_source || 'direct',
//                     notes: details.notes || '',
//                     officer_id: ObjectId( details.assigned_officer_details._id) || 'UNASSIGNED',
//                     recruiter_id: ObjectId( details.assigned_officer_details._id) || 'UNASSIGNED',
//                     interaction_history: [details.assigned_officer_details] || [],
//                     status: details.status || 'new',            
//                     created_at: new Date()
//                 });
//                 if (result.acknowledged) {
//                     return resolve(result.insertedId);
//                 } else {
//                     reject("Insert failed");
//                 }
//             } catch (err) {
//                 console.error(err);
//                 reject("Error processing request");
//             }
//         });
//     },
//     // Webhook to handle Meta lead and WhatsApp message
//     handleMetaWebhook: async (payload) => {
//         return new Promise(async (resolve, reject) => {
//             try {
            
//                 if (!payload || !payload.type || !payload.data) {
//                     return reject("Invalid webhook payload");
//                 }
//                 if (payload.type === 'lead') {
                
//                     const leadDetails = {
//                         name: payload.data.full_name || '',
//                         email: payload.data.email || '',
//                         phone: payload.data.phone || '',
//                         lead_source: 'meta',
//                         notes: payload.data.notes || '',
                    
//                     };
//                     // Create customer/lead in DB
//                     const customerId = await module.exports.createCustomer(leadDetails);
//                     resolve({ status: 'lead_created', customerId });
//                 } else if (payload.type === 'whatsapp') {
//                     // Extract WhatsApp message details
//                     const message = payload.data.message || '';
//                     const phone = payload.data.phone || '';
//                     // Find customer by phone
//                     const collection = db.get().collection(COLLECTION.LEADS);
//                     const customer = await collection.findOne({ phone: phone });
//                     if (!customer) {
//                         return reject("Customer not found for WhatsApp message");
//                     }
//                     // Add WhatsApp message to interaction history
//                     const interaction = {
//                         type: 'whatsapp',
//                         message: message,
//                         from: payload.data.from || '',
//                         received_at: new Date()
//                     };
//                     await collection.updateOne(
//                         { _id: customer._id },
//                         { $push: { interaction_history: interaction }, $set: { updated_at: new Date() } }
//                     );
//                     resolve({ status: 'whatsapp_message_logged', customerId: customer._id });
//                 } else {
//                     reject("Unknown webhook type");
//                 }
//             } catch (err) {
//                 console.error(err);
//                 reject("Error handling Meta webhook");
//             }
//         });
//     },
//     // Get all leads/clients with flexible filtering
//     getAllLeads: async (filters = {}) => {
//         return new Promise(async (resolve, reject) => {
//             try {
//                 const collection = db.get().collection(COLLECTION.LEADS);
//                 const query = {};
//                 Object.keys(filters).forEach(key => {
//                     if (Array.isArray(filters[key]) && filters[key].length > 0) {
//                         // If the filter value is an array, use $in operator
//                         query[key] = { $in: filters[key] };
//                     } else if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
//                         // For single value filters
//                         query[key] = filters[key];
//                     }
//                 });

//                 // Project only basic information
//                 const projection = {
//                     _id: 1,
//                     client_id: 1,
//                     name: 1,
//                     email: 1,
//                     phone: 1,
//                     status: 1,
//                     lead_source: 1,
//                     officer_id: 1,
//                     created_at: 1
//                 };

//                 const LEADS = await collection.find(query).project(projection).toArray();
//                 resolve(LEADS);
//             } catch (err) {
//                 console.error(err);
//                 reject("Error fetching LEADS");
//             }
//         });
//     },

//     // Get lead/client by ID
//     getClient: async (id) => {
//         return new Promise(async (resolve, reject) => {
//             try {
//                 const collection = db.get().collection(COLLECTION.CLIENTS);
//                 const lead = await collection.findOne({ _id: new ObjectId(id) });
//                 if (lead) {
//                     resolve(lead);
//                 } else {
//                     reject("Lead not found");
//                 }
//             } catch (err) {
//                 console.error(err);
//                 reject("Error fetching lead");
//             }
//         });
//     },

//     // Update lead/client
//     updateLead: async (id, updates) => {
//         return new Promise(async (resolve, reject) => {
//             try {
//                 const collection = db.get().collection(COLLECTION.CLIENTS);

//                 // If updating email or phone, check for duplicates
//                 if (updates.email || updates.phone) {
//                     const query = { _id: { $ne: new ObjectId(id) }, $or: [] };
//                     if (updates.email) query.$or.push({ email: updates.email });
//                     if (updates.phone) query.$or.push({ phone: updates.phone });

//                     if (query.$or.length > 0) {
//                         const duplicate = await collection.findOne(query);
//                         if (duplicate) return reject("Email or phone already in use by another client");
//                     }
//                 }

//                 updates.updated_at = new Date();

//                 // Handle reassignment if needed
//                 if (updates.officer_id === 'auto_assign') {
//                     const officersCollection = db.get().collection(COLLECTION.OFFICERS);
//                     const officers = await officersCollection.find({ status: 'active' }).toArray();

//                     if (officers.length > 0) {
//                         const counterCollection = db.get().collection(COLLECTION.COUNTERS);
//                         const assignmentCounter = await counterCollection.findOne({ _id: 'officer_assignment' });

//                         let lastIndex = 0;
//                         if (assignmentCounter) {
//                             lastIndex = assignmentCounter.sequence % officers.length;
//                         }

//                         updates.officer_id = officers[lastIndex]._id.toString();

//                         await counterCollection.updateOne(
//                             { _id: 'officer_assignment' },
//                             { $inc: { sequence: 1 } },
//                             { upsert: true }
//                         );
//                     } else {
//                         updates.officer_id = null;
//                     }
//                 }

//                 const result = await collection.updateOne(
//                     { _id: new ObjectId(id) },
//                     { $set: updates }
//                 );

//                 if (result.matchedCount === 0) {
//                     reject("Lead not found");
//                 } else if (result.modifiedCount === 0) {
//                     resolve("No changes made");
//                 } else {
//                     resolve("Lead updated successfully");
//                 }
//             } catch (err) {
//                 console.error(err);
//                 reject("Error updating lead");
//             }
//         });
//     },

//     // Add interaction/note to lead
//     addLeadInteraction: async (leadId, interaction) => {
//         return new Promise(async (resolve, reject) => {
//             try {
//                 const collection = db.get().collection(COLLECTION.CLIENTS);
//                 const interactionObj = {
//                     ...interaction,
//                     created_at: new Date(),
//                     id: new ObjectId()
//                 };

//                 const result = await collection.updateOne(
//                     { _id: new ObjectId(leadId) },
//                     {
//                         $push: { interaction_history: interactionObj },
//                         $set: { updated_at: new Date() }
//                     }
//                 );

//                 if (result.matchedCount === 0) {
//                     reject("Lead not found");
//                 } else {
//                     resolve("Interaction added successfully");
//                 }
//             } catch (err) {
//                 console.error(err);
//                 reject("Error adding interaction");
//             }
//         });
//     },

//     // Update lead status
//     updateLeadStatus: async (leadId, status) => {
//         return new Promise(async (resolve, reject) => {
//             try {
//                 const collection = db.get().collection(COLLECTION.CLIENTS);
//                 const result = await collection.updateOne(
//                     { _id: new ObjectId(leadId) },
//                     {
//                         $set: {
//                             lead_status: status,
//                             updated_at: new Date()
//                         }
//                     }
//                 );

//                 if (result.matchedCount === 0) {
//                     reject("Lead not found");
//                 } else {
//                     resolve("Lead status updated successfully");
//                 }
//             } catch (err) {
//                 console.error(err);
//                 reject("Error updating lead status");
//             }
//         });
//     },

//     // Update lead stage (lead → qualified lead → opportunity → customer)
//     updateLeadStage: async (leadId, stage) => {
//         return new Promise(async (resolve, reject) => {
//             try {
//                 const collection = db.get().collection(COLLECTION.CLIENTS);
//                 const result = await collection.updateOne(
//                     { _id: new ObjectId(leadId) },
//                     {
//                         $set: {
//                             stage: stage,
//                             updated_at: new Date()
//                         }
//                     }
//                 );

//                 if (result.matchedCount === 0) {
//                     reject("Lead not found");
//                 } else {
//                     resolve("Lead stage updated successfully");
//                 }
//             } catch (err) {
//                 console.error(err);
//                 reject("Error updating lead stage");
//             }
//         });
//     },

//     // Add additional information to lead
//     addAdditionalInfo: async (leadId, additionalInfo) => {
//         return new Promise(async (resolve, reject) => {
//             try {
//                 const collection = db.get().collection(COLLECTION.CLIENTS);
//                 const result = await collection.updateOne(
//                     { _id: new ObjectId(leadId) },
//                     {
//                         $set: {
//                             'additional_info': additionalInfo,
//                             updated_at: new Date()
//                         }
//                     }
//                 );

//                 if (result.matchedCount === 0) {
//                     reject("Lead not found");
//                 } else {
//                     resolve("Additional information updated successfully");
//                 }
//             } catch (err) {
//                 console.error(err);
//                 reject("Error updating additional information");
//             }
//         });
//     }
// }