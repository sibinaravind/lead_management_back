var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { leadSchema } = require("../validations/leadValidation");
const validatePartial = require("../utils/validatePartial");
const { DESIGNATIONS, STATUSES } = require('../constants/enums');
const { logActivity } = require('./customer_interaction_helper');
const { off } = require('../routes/officers/customer_router');
// Helper to get next sequence number

module.exports = {
    createLead: async (details) => {
    return new Promise(async (resolve, reject) => {
        try {
        // Validate incoming data
        const { error, value } = leadSchema.validate(details);
        if (error) return reject("Validation failed: " + error.details[0].message);

        const collection = db.get().collection(COLLECTION.LEADS);
        const officersCollection = db.get().collection(COLLECTION.OFFICERS);
        // Check for duplicate
        const collectionsToCheck = [
            collection,
            db.get().collection(COLLECTION.CUSTOMERS),
            db.get().collection(COLLECTION.DEAD_LEADS),
        ];

        for (const col of collectionsToCheck) {
            let query;
            if (value.email && value.email.trim() !== "") {
                query = { $or: [{ email: value.email }, { phone: value.phone }] };
            } else {
                query = { phone: value.phone };
            }
            const existing = await col.findOne(query);
            //  if (existing) return reject("Client already exists with this email or phone");
        }
        const client_id = `AELID${String(await getNextSequence("lead_id")).padStart(5, "0")}`;
        var assignedOfficer = null;
        if (!value.officer_id && value.service_type) {
            const rrConfig = await db.get()
            .collection(COLLECTION.ROUNDROBIN)
            .findOne({ name: value.service_type });
            if (rrConfig && Array.isArray(rrConfig.officers) && rrConfig.officers.length > 0) {
            const updateResult = await  db.get().collection(COLLECTION.COUNTER).findOneAndUpdate(
                { _id: `lead_roundrobin_${value.service_type}` },
                { $inc: { sequence: 1 } },
                { upsert: true, returnDocument: "after" }
            );

            const officerIndex = (updateResult.value.sequence - 1) % rrConfig.officers.length;
            const selectedOfficerId = rrConfig.officers[officerIndex];

             assignedOfficer = await officersCollection.findOne(
                { _id: ObjectId(selectedOfficerId) },
                { projection: { name: 1, officer_id: 1, email: 1, designation: 1 ,branch:1} }
            );
            }
        }else  if (value.officer_id != null && value.officer_id != '') {
             assignedOfficer = await officersCollection.findOne(
            { _id: ObjectId(value.officer_id )},
            { projection: { name: 1, officer_id: 1, email: 1, designation: 1 } }
            );
        }

        const assignedToValue = assignedOfficer != null  ? ObjectId(assignedOfficer._id) : "UNASSIGNED";
        const statusValue = assignedToValue != null ? (value.status || "HOT") : "UNASSIGNED";
        let recruiterIdValue = "UNASSIGNED";
        if (
            assignedOfficer != null &&
            Array.isArray(assignedOfficer.designation) &&
            assignedOfficer.designation.includes(DESIGNATIONS.COUNSILOR)
        ) {
            recruiterIdValue = ObjectId(assignedOfficer._id);
        }


        collection.insertOne({
            client_id,
            branch: Array.isArray(assignedOfficer?.branch) ? assignedOfficer.branch[0] || "AFFINIX" : assignedOfficer?.branch || "AFFINIX",
            officer_id: ObjectId(assignedToValue),
            recruiter_id: recruiterIdValue,
            status: statusValue,
             ...value,
            created_at: new Date(),
        })
        .then(result => {
            if (result.acknowledged) {
            // const eventsCollection = db.get().collection(COLLECTION.CUSTOMER_ACTIVITY);
            // eventsCollection.insertOne({
            //     type: "customer_created",
            //     client_id: ObjectId(result.insertedId),
            //     recruiter_id:recruiterIdValue,
            //     officer_id: assignedToValue,
            //     comment: value.note|| "",
            //     created_at: new Date(),
            // })
            // .then(() => {
            //     return resolve(result.insertedId);
            // })
            // .catch(eventErr => {
            //     console.error("Failed to log customer creation event:", eventErr);
            //     return resolve(result.insertedId);
            // });
            logActivity({
                    type: "customer_created",
                    client_id: result.insertedId  || null,
                    recruiter_id: recruiterIdValue || null,
                    officer_id: assignedToValue  || null,
                    comment: value.note || "",
                })
            return resolve(result.insertedId);

            } else {
            reject("Insert failed");
                }
            })
            .catch(err => {
                reject("Error processing request",err);
            });
        
        } catch (err) {
        reject("Error processing request");
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


   restoreClientFromDeadAndAssignOfficer: async (deadClientId, officerId = null,comment) => {
    return new Promise(async (resolve, reject) => {
        try {
            const deadCustomersCollection = db.get().collection(COLLECTION.DEAD_LEADS);
            const customersCollection = db.get().collection(COLLECTION.LEADS);
            const officersCollection = db.get().collection(COLLECTION.OFFICERS);

            // 1. Fetch the dead client
            const deadClient = await deadCustomersCollection.findOne({ _id: new ObjectId(deadClientId) });
            if (!deadClient) return reject("Dead client not found");

            // 2. Prepare client for restoration
            deadClient.status = 'FOLLOWUP';
            deadClient.updated_at = new Date();
            // 3. Optional: Assign officer info if officerId is provided
            let officerObjectId = null;
            if (officerId) {
                const officer = await officersCollection.findOne(
                    { _id: new ObjectId(officerId) },
                    { projection: { _id: 1, designation: 1 } }
                );

                if (officer) {
                    officerObjectId = new ObjectId(officer._id);
                    deadClient.officer_id = officerObjectId;
                     if (
                            officer != null &&
                            Array.isArray(officer.designation) &&
                            officer.designation.includes(DESIGNATIONS.COUNSILOR)
                    )
                    {
                        deadClient.recruiter_id = officerObjectId;
                    }
                }
            }

            // 4. Insert back to LEADS
            const insertResult = await customersCollection.insertOne(deadClient);
            if (!insertResult.acknowledged) return reject("Failed to restore client");

            // 5. Delete from DEAD_LEADS
            await deadCustomersCollection.deleteOne({ _id: new ObjectId(deadClientId) });

            // 6. Log activity
            // await activityCollection.insertOne({
            //     type: 'client_restored',
            //     client_id:ObjectId( deadClient._id),
            //     recruiter_id :ObjectId(deadClient.recruiter_id ) || null,
            //     officer_id:ObjectId (deadClient.officer_id || null), // Can be null
            //     created_at: new Date(),
            //     note: comment
            // });

            logActivity({   
                type: 'client_restored',
                client_id: insertResult.insertedId,
                recruiter_id: deadClient.recruiter_id || null,
                officer_id: officerObjectId || null,
                comment: comment || '',
            });

            resolve("Client restored successfully");

        } catch (err) {
            console.error(err);
            reject("Error restoring client");
        }
    });
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
                console.error(err);
                reject("Error fetching LEADS");
            }
        });
    },
    
        // db.leads.createIndex({ officer_id: 1 }); //tst add index to all  primary fields
        // db.leads.createIndex({ status: 1 });
        // db.leads.createIndex({ service_type: 1 });
        // db.leads.createIndex({ created_at: -1 });

    getAllFilteredLeads: async (filters, user , page = 1, limit = 20, ) => {
    return new Promise(async (resolve, reject) => {
            let officers = [];
            if (user.designation?.includes('ADMIN')) {
                officers = [];
            } else if (Array.isArray(user.officers)) {
                officers = user.officers.map(o => ({
                    ...o,
                    officer_id: o.officer_id || (typeof o === 'string' ? o : undefined),
                    user_id: o.user_id || (typeof o === 'object' && o.user_id ? o.user_id : undefined)
                }));
                const officerIds = officers.map(o => o.officer_id).filter(Boolean);
                const userIds = officers.map(o => o.user_id).filter(Boolean);
                const ids = [...officerIds, ...userIds].filter(Boolean);
                if (ids.length > 0) {
                    query.officer_id = { $in: ids };
                }
            }
        try {
            const query = {};
            // Filter Mapping - Only allow certain fields
            const filterableFields = ['status', 'service_type', 'lead_source', 'officer_id'];
            for (const key of filterableFields) {
                const value = filters[key];
                if (Array.isArray(value) && value.length > 0) {
                    query[key] = { $in: value };
                } else if (value) {
                    query[key] = value;
                }
            }

            // Access control
        
        

            // Pagination
            const skip = (page - 1) * limit;

            const collection = db.get().collection(COLLECTION.LEADS);

            const [total, leads] = await Promise.all([
                collection.countDocuments(query),
                collection.find(query, {
                        projection: {
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
                        },
                        skip,
                        limit,
                        sort: { created_at: -1 } // remove if not required
                    }).toArray()
            ]);

            resolve({
                total,
                page,
                totalPages: Math.ceil(total / limit),
                data: leads
            });

        } catch (err) {
            console.error(err);
            reject("Error fetching filtered LEADS");
        }
    });
    },  


     getDeadLeads: async () => {
        console.log("Fetching all dead leads");
        return new Promise(async (resolve, reject) => {
            try {
                const LEADS = await db.get().collection(COLLECTION.DEAD_LEADS).find().project( {
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
                    created_at: 1
                }).toArray();
                resolve(LEADS);
            } catch (err) {
                console.error(err);
                reject("Error fetching LEADS");
            }
        });
    },
    

    // Get lead/client by ID
  
}

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