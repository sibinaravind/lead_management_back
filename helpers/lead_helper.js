var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const e = require('express');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;

// Helper to get next sequence number

module.exports = {
    // Create Client/Lead
    createLead: async (details) => {
        
        return new Promise(async (resolve, reject) => {
            try {
                const collection = db.get().collection(COLLECTION.CUSTOMERS);
                const officersCollection = db.get().collection(COLLECTION.OFFICERS);
                // await collection.createIndex({ client_id: 1 }, { unique: true }); //req

                // Check for duplicate client (by email or phone)
                const existingClient = await collection.findOne({
                    $or: [
                        { email: details.email },
                        { phone: details.phone }
                    ]
                });
            
                if (existingClient) return reject("Client already exists with this email or phone");
                // Get next client number atomically
                const newNumber = await getNextSequence('customer_id');
                const client_id = `AECID${String(newNumber).padStart(5, '0')}`;
                // Handle automatic round-robin assignment if no assigned_to is provided
                if (!details.assigned_to) {
                    const officers = await officersCollection.find({
                        designation: { $in: [4,5] }
                    }).toArray();
                
                    if (officers.length > 0) {
                        // Get the counter collection
                        const counterCollection = db.get().collection(COLLECTION.COUNTER);

                        // First get current counter and update it atomically
                        const updateResult = await counterCollection.findOneAndUpdate(
                            { _id: 'lead_roundrobin' },
                            { $inc: { sequence: 1 } },
                            { upsert: true, returnDocument: 'after' }
                        );

                        // Calculate the officer index based on the updated sequence
                        const officerIndex = ( updateResult.value.sequence - 1) % officers.length;
                        // Assign the selected officer
                        details.assigned_to = officers[officerIndex]._id.toString();

                        // Get officer details
                        const assignedOfficer = officers[officerIndex];
                        details.assigned_officer_details = {
                            _id: ObjectId(assignedOfficer._id),
                            officer_id: assignedOfficer.officer_id,
                            name: assignedOfficer.name,
                            email: assignedOfficer.email,
                            designation: assignedOfficer.designation || 'Officer'
                        };
                    }
                } else {
                    // If assigned_to already exists, get the basic details of the officer
                    const assignedOfficer = await officersCollection.findOne(
                        { officer_id: details.assigned_to },
                        { projection: {name:1 ,officer_id:1 ,email: 1, designation: 1 } }
                    );

                    if (assignedOfficer) {
                        details.assigned_officer_details = {
                            _id: ObjectId(assignedOfficer._id),
                            officer_id: assignedOfficer.officer_id,
                            name: assignedOfficer.name ,
                            email: assignedOfficer.email,
                            designation: assignedOfficer.designation || 'Officer'
                        };
                    }
                }

                const isOfficerAssigned = details.assigned_officer_details && details.assigned_officer_details._id;
                const assignedToValue = isOfficerAssigned ? ObjectId(details.assigned_officer_details._id) : 'UNASSIGNED';
                let recruiterIdValue = 'UNASSIGNED';
                if (
                    isOfficerAssigned &&
                    Array.isArray(details.assigned_officer_details.designation) &&
                    (details.assigned_officer_details.designation.includes(4) || details.assigned_officer_details.designation.includes(5))
                ) {
                    recruiterIdValue = ObjectId(details.assigned_officer_details._id);
                }
                const statusValue = isOfficerAssigned ? (details.status || 'HOT') : 'UNASSIGNED';
                const result = await collection.insertOne({ // test add inital job add date  
                    client_id: client_id,
                    name: details.name,
                    email: details.email,
                    phone: details.phone,
                    alternate_phone: details.alternate_phone || null,
                    whatsapp: details.whatsapp || null,
                    gender: details.gender || null,
                    dob: details.dob || null ,
                    matrial_status: details.matrial_status || null,
                    address: details.address || null,
                    city: details.city || null,
                    state: details.state || null,
                    country: details.country || null,
                    job_interests: details.job_interests || [],
                    country_interested: details.country_interested || [],
                    expected_salary: details.expected_salary || null,
                    qualification: details.qualification || null,
                    university: details.university || null,
                    passing_year: details.passing_year || null,
                    experience: details.experience || null,
                    skills: details.skills || [],
                    profession: details.profession || null,
                    specialized_in: details.specialized_in || null,
                    lead_source: details.lead_source || 'direct',
                    notes: details.notes || '',
                    assigned_to: assignedToValue,
                    branch_name: details.branch_name || '',
                    service_type: details.service_type || '',
                    recruiter_id: recruiterIdValue,
                    status:statusValue,    
                    on_call_communication: details.on_call_communication || false, 
                    on_whatsapp_communication: details.on_whatsapp_communication || false,
                    on_email_communication: details.on_email_communication || false,   
                    created_at: new Date()
                });
                if (result.acknowledged) {
                    try {
                        const eventsCollection = db.get().collection(COLLECTION.CUSTOMER_ACTIVITY);
                        await eventsCollection.insertOne({
                            type: 'customer_created',
                            client_id: result.insertedId,
                            officer_id: details.assigned_officer_details != null ? details.assigned_officer_details._id : 'UNASSIGNED',
                            comment:details.notes || '',
                            created_at: new Date(),
                           
                        });
                    } catch (eventErr) {
                        console.error("Failed to log customer creation event:", eventErr);
                    }
                    return resolve(result.insertedId);
                } else {
                    reject("Insert failed");
                }
            } catch (err) {
                console.log(err);
                reject("Error processing request");
            }
        });
    },
    assignOfficerToLead: async (clientId, officerId) => {
        return new Promise(async (resolve, reject) => {
            try {
              
                const officer = await db.get().collection(COLLECTION.OFFICERS).findOne(
                    { _id: ObjectId( officerId) },
                    { projection: { _id: 1, first_name: 1, last_name: 1, officer_id: 1, email: 1, designation: 1 } }
                );
                if (!officer) {
                    return reject("Officer not found");
                }

                let updateFields = {
                    updated_at: new Date()
                };

                if (Array.isArray(officer.designation) && (officer.designation.includes(4) || officer.designation.includes(5))) {
                    updateFields.assigned_to = officer._id;
                    updateFields.recruiter_id = officer._id;
                } else {
                    updateFields.assigned_to = officer._id;
                }

                const result = await db.get().collection(COLLECTION.CUSTOMERS).updateOne(
                    { _id: new ObjectId(clientId) },
                    { $set: updateFields }
                );
                if (result.modifiedCount > 0) {
                    try {
                        const eventsCollection = db.get().collection(COLLECTION.CUSTOMER_ACTIVITY);
                        await eventsCollection.insertOne({
                            type: 'officer_assigned',
                            client_id: new ObjectId(clientId),
                            officer_id: new ObjectId(officerId),
                            created_at: new Date()
                        });
                    } catch (eventErr) {
                        console.error("Failed to log officer assignment event:", eventErr);
                    }
                }

                if (result.matchedCount === 0) {
                    reject("Client not found");
                } else {
                    resolve("Officer assigned successfully");
                }
            } catch (err) {
                console.error(err);
                reject("Error assigning officer");
            }
        });
    },
   logCallEvent: async (data, officerId) => {
    return new Promise(async (resolve, reject) => {
        try {
            const customersCollection = db.get().collection(COLLECTION.CUSTOMERS);

            if (data.client_status && (data.client_status != null || data.client_status !== '')) {
                if (data.client_status === 'DEAD') {
                    console.log("Moving client to DEAD_CUSTOMERS collection:", data.client_id);
                    // Move to DEAD_CUSTOMERS
                    const clientDoc = await customersCollection.findOne({ _id: new ObjectId(data.client_id) });
                    console.log("Client document found:", clientDoc);
                    if (clientDoc) {
                        clientDoc.status = 'DEAD';
                    }
                    if (clientDoc) {
                        const insertResult = await db.get().collection(COLLECTION.DEAD_CUSTOMERS).insertOne({
                            ...clientDoc,
                            // status : 'DEAD',
                            moved_to_dead_at: new Date(),
                            dead_reason: data.comment || '',
                            moved_by: officerId
                        });

                        if (insertResult.acknowledged) {
                            await customersCollection.deleteOne({ _id: new ObjectId(data.client_id) });
                            data.status = data.client_status;
                        } else {
                            return reject("Failed to do action");
                        }
                    }
                    else {
                        return reject("Client not found");
                    }
                } else {
                    // Update status
                    const updateResult = await customersCollection.updateOne(
                        { _id: new ObjectId(data.client_id) },
                        { $set: { status: data.client_status } }
                    );
                    console.log("Update result:", updateResult);
                    // if (updateResult.modifiedCount === 0) {
                    //     return reject("Failed to update client status");
                    // }
                }
            }

            // Log the call event only after successful status update/move
            const insertResult = await db.get().collection(COLLECTION.CUSTOMER_ACTIVITY).insertOne({
                type: 'call_event',
                client_id: new ObjectId(data.client_id),
                officer_id: officerId,
                duration: data.duration || 0,
                next_schedule: data.next_schedule || null,
                client_status: data.client_status || '',
                comment: data.comment || '',
                call_type: data.call_type || '',
                call_status: data.call_status || '',
                created_at: new Date()
            });

            if (insertResult.acknowledged) {
              
                resolve(
                    "Call event logged successfully"
                );
            } else {
                reject("Failed to log call event");
            }
        } catch (err) {
            console.error(err);
            reject("Error logging call event");
        }
    });
    },




    // Get all leads/clients with flexible filtering
    getAllLeads: async (filters = {}) => {
        return new Promise(async (resolve, reject) => {
            try {
                const collection = db.get().collection(COLLECTION.CUSTOMERS);
                const query = {};
                Object.keys(filters).forEach(key => {
                    if (Array.isArray(filters[key]) && filters[key].length > 0) {
                        // If the filter value is an array, use $in operator
                        query[key] = { $in: filters[key] };
                    } else if (filters[key] !== undefined && filters[key] !== null && filters[key] !== '') {
                        // For single value filters
                        query[key] = filters[key];
                    }
                });

                // Project only basic information
                const projection = {
                    _id: 1,
                    client_id: 1,
                    name: 1,
                    email: 1,
                    phone: 1,
                    status: 1,
                    lead_source: 1,
                    assigned_to: 1,
                    created_at: 1
                };

                const customers = await collection.find(query).project(projection).toArray();
                resolve(customers);
            } catch (err) {
                console.error(err);
                reject("Error fetching customers");
            }
        });
    },
    

    // Get lead/client by ID
    getClient: async (id) => {
        return new Promise(async (resolve, reject) => {
            try {
                const collection = db.get().collection(COLLECTION.CLIENTS);
                const lead = await collection.findOne({ _id: new ObjectId(id) });
                if (lead) {
                    resolve(lead);
                } else {
                    reject("Lead not found");
                }
            } catch (err) {
                console.error(err);
                reject("Error fetching lead");
            }
        });
    },

    // Update lead/client
    updateLead: async (id, updates) => {
        return new Promise(async (resolve, reject) => {
            try {
                const collection = db.get().collection(COLLECTION.CLIENTS);

                // If updating email or phone, check for duplicates
                if (updates.email || updates.phone) {
                    const query = { _id: { $ne: new ObjectId(id) }, $or: [] };
                    if (updates.email) query.$or.push({ email: updates.email });
                    if (updates.phone) query.$or.push({ phone: updates.phone });

                    if (query.$or.length > 0) {
                        const duplicate = await collection.findOne(query);
                        if (duplicate) return reject("Email or phone already in use by another client");
                    }
                }

                updates.updated_at = new Date();

                // Handle reassignment if needed
                if (updates.assigned_to === 'auto_assign') {
                    const officersCollection = db.get().collection(COLLECTION.OFFICERS);
                    const officers = await officersCollection.find({ status: 'active' }).toArray();

                    if (officers.length > 0) {
                        const counterCollection = db.get().collection(COLLECTION.COUNTERS);
                        const assignmentCounter = await counterCollection.findOne({ _id: 'officer_assignment' });

                        let lastIndex = 0;
                        if (assignmentCounter) {
                            lastIndex = assignmentCounter.sequence % officers.length;
                        }

                        updates.assigned_to = officers[lastIndex]._id.toString();

                        await counterCollection.updateOne(
                            { _id: 'officer_assignment' },
                            { $inc: { sequence: 1 } },
                            { upsert: true }
                        );
                    } else {
                        updates.assigned_to = null;
                    }
                }

                const result = await collection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updates }
                );

                if (result.matchedCount === 0) {
                    reject("Lead not found");
                } else if (result.modifiedCount === 0) {
                    resolve("No changes made");
                } else {
                    resolve("Lead updated successfully");
                }
            } catch (err) {
                console.error(err);
                reject("Error updating lead");
            }
        });
    },

    // Add interaction/note to lead
    addLeadInteraction: async (leadId, interaction) => {
        return new Promise(async (resolve, reject) => {
            try {
                const collection = db.get().collection(COLLECTION.CLIENTS);
                const interactionObj = {
                    ...interaction,
                    created_at: new Date(),
                    id: new ObjectId()
                };

                const result = await collection.updateOne(
                    { _id: new ObjectId(leadId) },
                    {
                        $push: { interaction_history: interactionObj },
                        $set: { updated_at: new Date() }
                    }
                );

                if (result.matchedCount === 0) {
                    reject("Lead not found");
                } else {
                    resolve("Interaction added successfully");
                }
            } catch (err) {
                console.error(err);
                reject("Error adding interaction");
            }
        });
    },

    // Update lead status
    updateLeadStatus: async (leadId, status) => {
        return new Promise(async (resolve, reject) => {
            try {
                const collection = db.get().collection(COLLECTION.CLIENTS);
                const result = await collection.updateOne(
                    { _id: new ObjectId(leadId) },
                    {
                        $set: {
                            lead_status: status,
                            updated_at: new Date()
                        }
                    }
                );

                if (result.matchedCount === 0) {
                    reject("Lead not found");
                } else {
                    resolve("Lead status updated successfully");
                }
            } catch (err) {
                console.error(err);
                reject("Error updating lead status");
            }
        });
    },

    // Update lead stage (lead → qualified lead → opportunity → customer)
    updateLeadStage: async (leadId, stage) => {
        return new Promise(async (resolve, reject) => {
            try {
                const collection = db.get().collection(COLLECTION.CLIENTS);
                const result = await collection.updateOne(
                    { _id: new ObjectId(leadId) },
                    {
                        $set: {
                            stage: stage,
                            updated_at: new Date()
                        }
                    }
                );

                if (result.matchedCount === 0) {
                    reject("Lead not found");
                } else {
                    resolve("Lead stage updated successfully");
                }
            } catch (err) {
                console.error(err);
                reject("Error updating lead stage");
            }
        });
    },

    // Add additional information to lead
    addAdditionalInfo: async (leadId, additionalInfo) => {
        return new Promise(async (resolve, reject) => {
            try {
                const collection = db.get().collection(COLLECTION.CLIENTS);
                const result = await collection.updateOne(
                    { _id: new ObjectId(leadId) },
                    {
                        $set: {
                            'additional_info': additionalInfo,
                            updated_at: new Date()
                        }
                    }
                );

                if (result.matchedCount === 0) {
                    reject("Lead not found");
                } else {
                    resolve("Additional information updated successfully");
                }
            } catch (err) {
                console.error(err);
                reject("Error updating additional information");
            }
        });
    }
}



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
//                 const collection = db.get().collection(COLLECTION.CUSTOMERS);
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
//                 // Handle automatic round-robin assignment if no assigned_to is provided
//                 console.log("Client ID generated:", client_id);
//                 if (!details.assigned_to) {
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
//                         details.assigned_to = officers[officerIndex]._id.toString();

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
//                     // If assigned_to already exists, get the basic details of the officer
//                     const assignedOfficer = await officersCollection.findOne(
//                         { _id: new ObjectId(details.assigned_to) },
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
//                     assigned_to: ObjectId( details.assigned_officer_details._id) || 'UNASSIGNED',
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
//                     const collection = db.get().collection(COLLECTION.CUSTOMERS);
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
//                 const collection = db.get().collection(COLLECTION.CUSTOMERS);
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
//                     assigned_to: 1,
//                     created_at: 1
//                 };

//                 const customers = await collection.find(query).project(projection).toArray();
//                 resolve(customers);
//             } catch (err) {
//                 console.error(err);
//                 reject("Error fetching customers");
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
//                 if (updates.assigned_to === 'auto_assign') {
//                     const officersCollection = db.get().collection(COLLECTION.OFFICERS);
//                     const officers = await officersCollection.find({ status: 'active' }).toArray();

//                     if (officers.length > 0) {
//                         const counterCollection = db.get().collection(COLLECTION.COUNTERS);
//                         const assignmentCounter = await counterCollection.findOne({ _id: 'officer_assignment' });

//                         let lastIndex = 0;
//                         if (assignmentCounter) {
//                             lastIndex = assignmentCounter.sequence % officers.length;
//                         }

//                         updates.assigned_to = officers[lastIndex]._id.toString();

//                         await counterCollection.updateOne(
//                             { _id: 'officer_assignment' },
//                             { $inc: { sequence: 1 } },
//                             { upsert: true }
//                         );
//                     } else {
//                         updates.assigned_to = null;
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