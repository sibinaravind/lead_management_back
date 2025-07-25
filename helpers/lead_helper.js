var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { leadSchema } = require("../validations/leadValidation");
const validatePartial = require("../utils/validatePartial");
const { DESIGNATIONS, STATUSES } = require('../constants/enums');
const { logActivity } = require('./customer_interaction_helper');
const { safeObjectId } = require('../utils/safeObjectId');
const {callActivityValidation} = require('../validations/callActivityValidation'); 
// Helper to get next sequence number
module.exports = {
createLead: async (details) => {
  return new Promise(async (resolve, reject) => {
    try {
      // ✅ Validate input
      const { error, value } = leadSchema.validate(details);
      if (error) return reject("Validation failed: " + error.details[0].message);
      const dbInstance = db.get();
      const leadsCol = dbInstance.collection(COLLECTION.LEADS);
      const officersCol = dbInstance.collection(COLLECTION.OFFICERS);
      // ✅ Check for duplicates
      const collectionsToCheck = [
        leadsCol,
        dbInstance.collection(COLLECTION.CUSTOMERS),
        dbInstance.collection(COLLECTION.DEAD_LEADS),
      ];

      for (const col of collectionsToCheck) {
        const query = value.email?.trim()
          ? { $or: [{ email: value.email }, { phone: value.phone }] }
          : { phone: value.phone };

        const exists = await col.findOne(query);
        // if (exists) return reject("Client already exists");
      }

      // ✅ Generate client ID
      const leadIdSeq = await getNextSequence("lead_id");
      const client_id = `AELID${String(leadIdSeq).padStart(5, "0")}`;

      // ✅ Officer assignment
      let assignedOfficer = null;

      if (!value.officer_id && value.service_type) {
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
      // ✅ Recruiter logic
      let recruiterIdValue = "UNASSIGNED";
      if (
        assignedOfficer?.designation?.includes(DESIGNATIONS.COUNSILOR)
      ) {
        recruiterIdValue = safeObjectId(assignedOfficer._id);
      }
      // ✅ Prepare insert data
      value.branch = Array.isArray(assignedOfficer?.branch) && assignedOfficer.branch.length > 0
        ? assignedOfficer.branch[0]
        : value.branch || "AFFINIX";
      // ✅ Insert lead
      const result = await leadsCol.insertOne({
        client_id,
        officer_id: assignedOfficer ? safeObjectId(assignedOfficer._id) : "UNASSIGNED",
        recruiter_id: recruiterIdValue,
        status: assignedOfficer ? value.status || "HOT" : "UNASSIGNED",
        ...value,
        created_at: new Date(),
      });

      if (result.acknowledged) {
            if(value.officer_id) //for fix the error when officer_id not settting as ObjectId
            {
                leadsCol.updateOne({ _id: result.insertedId }, { $set: { officer_id: safeObjectId(value.officer_id) } });
            }

        await logActivity({
          type: "customer_created",
          client_id: result.insertedId,
          recruiter_id: recruiterIdValue,
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
    // Get all leads/clients with flexible filtering
  getAllLeads: async (filters) => {
        return new Promise(async (resolve, reject) => {
            try {
                
                // const query = {};
                // Object.keys(filters).forEach(key => {
                //     if (Array.isArray(filters[key]) && filters[key].length > 0) {
                //         // If the filter value is an array, use $in operator
                //         query[key] = { $in: filters[key] };
                //     } else if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
                //         // For single value filters
                //         query[key] = filters[key];
                //     }
                // });

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
    
    // db.leads.createIndex({ officer_id: 1 }); //tst add index to all  primary fields
    // db.leads.createIndex({ status: 1 });
    // db.leads.createIndex({ service_type: 1 });
    // db.leads.createIndex({ created_at: -1 });

   getLeadCountByCategory: async (decoded, query) => {
        const { designation, employee } = query;
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
               if (designation && typeof designation === 'string') {
                let matchDesignations = [];
                if (designation === 'CRE') {
                  matchDesignations = [DESIGNATIONS.CRE];
                } else if (designation === 'RECRUITER') {
                  matchDesignations = [DESIGNATIONS.COUNSILOR ,DESIGNATIONS.ADMIN];
                }

                if (matchDesignations.length > 0) {
                  const officerList = await db.get().collection(COLLECTION.OFFICERS)
                    .find({ designation: { $in: matchDesignations } }) // works if designation is an array
                    .project({ _id: 1 })
                    .toArray();

                  const officerIds = officerList.map(officer => officer._id);
                  filter.officer_id = { $in: officerIds };
                }
            
          }
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
          const historyCount = await db.get().collection(COLLECTION.CALL_LOG_ACTIVITY).countDocuments({
            created_at: { $gte: today, $lt: tomorrow },
            ...filter
          });
          return {
            TOTAL: getCountVal("TOTAL"),
            NEW: getCountVal("NEW"),
            TODAY: getCountVal("TODAY"),
            TOMORROW: getCountVal("TOMORROW"),
            UPCOMING: getCountVal("UPCOMING"),
            PENDING: getCountVal("PENDING"),
            HISTORY: historyCount
          };
        } catch (err) {
          console.error("getLeadCountByCategory error:", err);
          throw new Error("Server Error");
        }
    },

    getFilteredDeadLeads: async (query, decoded) => {
        try {
          const {
            filterCategory,
            page = 1,
            limit = 10,
            status,
            branch,
            employee,
            serviceType,
            profession,
            leadSource,
            campagin,
            startDate,
            endDate,
            searchString,
            designation
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
            // const empId = safeObjectId(employee);
            // filter.$or = [
            //   { officer_id: empId },
            //   { recruiter_id: empId }
            // ];
          } else if (isAdmin) {
              if (designation && typeof designation === 'string') {
                let matchDesignations = [];
                if (designation === 'CRE') {
                  matchDesignations = ['CRE'];
                } else if (designation === 'RECRUITER') {
                  matchDesignations = ['COUNSILOR'];
                }

                if (matchDesignations.length > 0) {
                  const officerList = await db.get().collection(COLLECTION.OFFICERS)
                    .find({ designation: { $in: matchDesignations } }) // works if designation is an array
                    .project({ _id: 1 })
                    .toArray();

                  const officerIds = officerList.map(officer => officer._id);
                  filter.officer_id = { $in: officerIds };
                }
            
          }
          } else if (officerIdList.length > 0) {
             filter.officer_id = { $in: [safeObjectId(decoded?._id), ...officerIdList] };
            // const ids = [safeObjectId(decoded?._id), ...officerIdList];

            // filter.$or = [
            //   { officer_id: { $in: ids } },
            //   { recruiter_id: { $in: ids } }
            // ];

          } else {
             filter.officer_id = safeObjectId(decoded?._id);
            // const userId = safeObjectId(decoded?._id);

            // filter.$or = [
            //   { officer_id: userId },
            //   { recruiter_id: userId }
            // ];
          }


          if (filterCategory === 'NEW') {
            filter.status =  STATUSES.HOT;
          } 
          else if (status) {
            filter.status = status;
          }

          // Additional filters
          if (branch) filter.branch = branch;
          if (serviceType) filter.service_type = serviceType;
          if (profession) filter.profession = profession;
          if (leadSource) filter.lead_source = leadSource;
          if (campagin) filter.campagin = campagin;

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
                      next_schedule: "$lastcall.next_schedule",
                      feedback: "$lastcall.comment",
                      created_at: 1,
                      officer_id: 1,
                      officer_name: "$officer.name",
                      officer_staff_id: "$officer.officer_id",
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
          console.error('getFilteredLeads error:', error);
          throw new Error('Server Error');
        }
  },  

   getCallHistoryWithFilters: async (query, decoded, ) => {
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
            designation
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
              if (designation && typeof designation === 'string') {
                let matchDesignations = [];
                if (designation === 'CRE') {
                  matchDesignations = ['CRE'];
                } else if (designation === 'RECRUITER') {
                  matchDesignations = ['COUNSILOR'];
                }

                if (matchDesignations.length > 0) {
                  const officerList = await db.get().collection(COLLECTION.OFFICERS)
                    .find({ designation: { $in: matchDesignations } }) // works if designation is an array
                    .project({ _id: 1 })
                    .toArray();

                  const officerIds = officerList.map(officer => officer._id);
                  filter.officer_id = { $in: officerIds };
                }
              }
          }
          // Additional filters
         
          if (callType) filter.call_type = callType;
          if (callStatus) filter.call_status = callStatus;
           if (status) filter.status = status;
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
          // Search
          if (searchString) {
            const regex = new RegExp(searchString, 'i');
            filter.$or = [
              { phone: { $regex: regex } },
              { client_id: { $regex: regex } }
            ];
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
                  as: "client"
                }
              },
              {
                $unwind: {
                  path: "$client",
                  preserveNullAndEmptyArrays: true
                }
              },

              // Final Project
              {
                $project: {
                  _id: 1,
                  type: 1,
                  client_id: 1,
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
                  client_name: "$client.name",
                  client_email: "$client.email",
                  client_phone: "$client.phone",
                  client_status: "$client.status",
                  client_branch: "$client.branch",
                  client_lead_source: "$client.lead_source",
                  client_service_type: "$client.service_type"
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
    getDeadLeads: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                const LEADS = await db.get().collection(COLLECTION.DEAD_LEADS).find({ status: "DEAD" }).project( {
                    _id: 1,
                    client_id: 1,
                    name: 1,
                    email: 1,
                    country_code: 1,
                    phone: 1,
                    service_type: 1,
                    status: 1,
                    lead_source: 1,
                    officer_id: 1,
                    created_at: 1,
                    dead_lead_reason: 1,
                    moved_to_dead_at: 1,
                }).toArray();
                resolve(LEADS);
            } catch (err) {
                console.error(err);
                reject("Error fetching LEADS");
            }
        });
    },
     getFilteredDeadLeads: async (query, decoded) => {
        try {
          const {
            filterCategory,
            page = 1,
            limit = 10,
            branch,
            employee,
            serviceType,
            profession,
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
            
          } else if (officerIdList.length > 0) {
             filter.officer_id = { $in: [safeObjectId(decoded?._id), ...officerIdList] };
          
          } else {
             filter.officer_id = safeObjectId(decoded?._id);
          }
        
          filter.status = STATUSES.DEAD;
          
          // Additional filters
          if (branch) filter.branch = branch;
          if (serviceType) filter.service_type = serviceType;
          if (profession) filter.profession = profession;
          if (leadSource) filter.lead_source = leadSource;
          if (campagin) filter.campagin = campagin;

          // Date filters: created_at or lastcall.next_schedule
          let dateField = 'moved_to_dead_at';
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
          const leadsCollection = db.get().collection(COLLECTION.DEAD_LEADS);

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
                      dead_lead_reason:1,
                      moved_to_dead_at: 1,
                      next_schedule: "$lastcall.next_schedule",
                      feedback: "$lastcall.comment",
                      created_at: 1,
                      officer_id: 1,
                      officer_name: "$officer.name",
                      officer_staff_id: "$officer.officer_id",
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
          console.error('getFilteredLeads error:', error);
          throw new Error('Server Error');
        }
  },  

  restoreClientFromDeadAndAssignOfficer : async (body, req_officer_id) => {
  return new Promise(async (resolve, reject) => {
    try {
      const {
        client_id: deadClientId,
        officer_id,
        client_status,
        ...callLogData
      } = body;
      const deadCustomersCollection = db.get().collection(COLLECTION.DEAD_LEADS);
      const leadsCollection = db.get().collection(COLLECTION.LEADS);
      const officersCollection = db.get().collection(COLLECTION.OFFICERS);
      const activityCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);
      if (!deadClientId || !client_status) {
        return reject("Missing required fields: client_id or client_status");
      }
      const deadClient = await deadCustomersCollection.findOne({ _id: new ObjectId(deadClientId) });
      if (!deadClient) return reject("Dead client not found");
      const { error, value } = callActivityValidation.validate({
        ...callLogData,
        client_id: deadClientId,
        client_status,
      });
      if (error) return reject("Validation failed: " + error.details[0].message);
      const validatedData = value;
      let officerObjectId = null;
      if (officer_id) {
        const officer = await officersCollection.findOne(
          { _id: new ObjectId(officer_id) },
          { projection: { _id: 1, designation: 1 } }
        );
        if (officer) {
          officerObjectId = new ObjectId(officer._id);
          if (!deadClient.officer_id) deadClient.officer_id = officerObjectId;
          if (
            Array.isArray(officer.designation) &&
            officer.designation.includes(DESIGNATIONS.COUNSILOR)
          ) {
            if (!deadClient.recruiter_id) {
              deadClient.recruiter_id = officerObjectId;
            }
          }
        }
      }
      
      const callActivity = {
        type: 'call_event',
        client_id: new ObjectId(deadClientId),
        officer_id:  new ObjectId(req_officer_id),
        duration: validatedData.duration,
        next_schedule:  validatedData.next_schedule,
        next_shedule_time: validatedData.next_shedule_time,
        comment: validatedData.comment || '',
        call_type: validatedData.call_type || '',
        call_status: validatedData.call_status || '',
        created_at: new Date()
      };
      const logResult = await activityCollection.insertOne(callActivity);
      if (!logResult.acknowledged) return reject("Failed to restore client to LEADS");
      // Update client doc before restore
      deadClient.status = validatedData.client_status;
      deadClient.lastcall = { ...callActivity, _id: logResult.insertedId };
      deadClient.updated_at = new Date();
      // Insert to LEADS collection
      const insertResult = await leadsCollection.insertOne(deadClient);
      if (!insertResult.acknowledged) return reject("Failed to restore client to LEADS");
      // Remove from DEAD_LEADS
      await deadCustomersCollection.deleteOne({ _id: new ObjectId(deadClientId) });
      // Log system activities
      await logActivity({
        type: 'client_restored',
        client_id:  new ObjectId(deadClientId),
        recruiter_id:deadClient.recruiter_id != null ? new ObjectId(deadClient.recruiter_id ) : null,
        officer_id:new ObjectId( officerObjectId ||  deadClient.officer_id) || null,
        client_status: deadClient.client_status,
        comment: validatedData.comment || comment
      });
      resolve("Client restored to LEADS successfully");
    } catch (err) {
      console.error("restoreClientFromDeadAndAssignOfficer Error:", err);
      reject("Error restoring client");
    }
  });
  },

 permanentlyCloseDeadLead: (body, req_officer_id) => {
  return new Promise(async (resolve, reject) => {
    try {
      const {
        client_id: deadClientId,
        // ...callLogData
      } = body;
      if (!deadClientId) return reject("Missing required field: client_id");
      const clientObjectId = new ObjectId(deadClientId);
      const officerObjectId = new ObjectId(req_officer_id);
      const deadCustomersCollection = db.get().collection(COLLECTION.DEAD_LEADS);
      const activityCollection = db.get().collection(COLLECTION.CALL_LOG_ACTIVITY);
      const customerEventCollection = db.get().collection(COLLECTION.CUSTOMER_ACTIVITY);
      // Validate input first before any DB operation
      const validatedData = validatePartial(callActivityValidation, body);
      const callActivity = {
        type: 'call_event',
        client_id: clientObjectId,
        officer_id: officerObjectId,
        duration: validatedData.duration,
        comment: validatedData.comment || '',
        call_type: validatedData.call_type || '',
        call_status: validatedData.call_status || '',
        created_at:  new Date(),
      };

      // Use findOneAndUpdate to verify existence and update status
      const updateResult = await deadCustomersCollection.findOneAndUpdate(
        { _id: clientObjectId },
        {
          $set: {
            status: 'CLOSED',
            updated_at: new Date()
          }
        },
        { returnDocument: 'after', projection: { recruiter_id: 1 } }
      );
      if (!updateResult.value) return reject("Dead client not found");

      // Insert call activity and get its ID
      const logResult = await activityCollection.insertOne(callActivity);
    
      if (!logResult.acknowledged) return reject("Failed to log call activity");

      // Update lastcall field with the new call log
      await deadCustomersCollection.updateOne(
        { _id: clientObjectId },
        {
          $set: {
            lastcall: { ...callActivity, _id: logResult.insertedId }
          }
        }
      );
      // Insert customer activity event
      await customerEventCollection.insertOne({
        client_id: clientObjectId,
        type: 'status_update',
        status: 'CLOSED',
        comment: validatedData.comment || '',
        recruiter_id: (updateResult.value.recruiter_id && updateResult.value.recruiter_id !== 'UNASSIGNED' && updateResult.value.recruiter_id !== null)
          ? new ObjectId(updateResult.value.recruiter_id)
          : null,
        officer_id: officerObjectId,
        created_at: new Date(),
      });

      resolve("Dead lead marked as CLOSED successfully");
    } catch (err) {
      console.error("permanentlyCloseDeadLead Error:", err);
      reject(err.message || err || "Error closing dead lead");
    }
  });
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