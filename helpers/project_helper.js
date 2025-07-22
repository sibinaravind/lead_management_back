var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
// const getNextSequence = require('../utils/get_next_unique').getNextSequence;
const { STATUSES } = require('../constants/enums');
const { clientValidation, projectValidation, vacancyValidation } = require("../validations/projectValidation");
const validatePartial = require("../utils/validatePartial");
// Helper to get next sequence number

module.exports = {
    // Create Client
    createClient: async (details) => {
        return new Promise(async (resolve, reject) => {
            try {

                const { error, value } = clientValidation.validate(details);
                if (error) return reject("Validation failed: " + error.details[0].message);
                details = value;
                const collection = db.get().collection(COLLECTION.CLIENTS);
                // // Ensure unique index on client_id (run once in your setup/migration scripts)
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
                // const newNumber = await getNextSequence('client_id');
                // const client_id = `AECID${String(newNumber).padStart(5, '0')}`;
                collection.insertOne({
                    // client_id: client_id,
                    name: details.name,
                    email: details.email,
                    phone: details.phone,
                    alternate_phone: details.alternate_phone,
                    address: details.address,
                    city: details.city,
                    state: details.state,
                    country: details.country,
                    status: STATUSES.ACTIVE,
                    created_at: new Date()
                }).then(result => {
                    if (result.acknowledged) {
                        resolve(result.insertedId);
                    } else {
                        reject("Insert failed");
                    }
                }).catch(err => {
                    console.error(err);
                    reject("Error processing request");
                });
            } catch (err) {
                console.error(err);
                reject(err || "Error processing request");
            }
        });
    },
    // Edit Client
    editClient: async (clientId, updateFields) => {
        const filteredFields = validatePartial(clientValidation, updateFields);
        return new Promise(async (resolve, reject) => {
            try {
                db.get().collection(COLLECTION.CLIENTS).updateOne(
                    { _id: ObjectId(clientId) },
                    { $set: filteredFields }
                ).then(result => {

                    if (result.modifiedCount > 0) {
                        resolve(true);
                    } else {
                        reject("Update failed or no changes made");
                    }
                }).catch(err => {
                    console.error(err);
                    reject("Error processing request");
                });
            } catch (err) {

                reject(err || "Error processing request");
            }
        });
    },
    // Get Client List  
    getClientList: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                const clients = await db.get().collection(COLLECTION.CLIENTS).find({ status: { $ne: STATUSES.DELETED } }).toArray();
                resolve(clients);
            } catch (err) {
                console.error(err);
                reject(err || "Error fetching client list");
            }
        });
    },
    deleteClient: async (clientId) => {
        return new Promise(async (resolve, reject) => {
            try {
                const result = await db.get().collection(COLLECTION.CLIENTS).updateOne(
                    { _id: ObjectId(clientId) },
                    { $set: { status: STATUSES.DELETED, updated_at: new Date() } }
                );
                if (result.modifiedCount > 0) {
                    resolve(true);
                } else {
                    reject("Delete failed or client not found");
                }
            } catch (err) {

                reject(err || "Error deleting client");
            }
        });
    },

    createProject: async (details) => {
        return new Promise(async (resolve, reject) => {
            try {
                const { error, value } = projectValidation.validate(details);
                if (error) return reject("Validation failed: " + error.details[0].message);
                details = value;
                const collection = db.get().collection(COLLECTION.PROJECTS);
                // const newNumber = await getNextSequence('project_id');
                // const project_id = `AEPID${String(newNumber).padStart(5, '0')}`;
                collection.insertOne({
                    // project_id: project_id,
                    project_name: details.project_name,
                    organization_type: details.organization_type,
                    organization_category: details.organization_category,
                    organization_name: details.organization_name,
                    country: details.country,
                    city: details.city,
                    status: STATUSES.ACTIVE,
                    created_at: new Date()
                }).then(result => {
                    if (result.acknowledged) {
                        resolve(result.insertedId);
                    } else {
                        reject("Insert failed");
                    }
                }).catch(err => {
                    reject("Error processing request");
                });
            } catch (err) {
                reject(err || "Error processing request");
            }
        });
    },

    // // Edit Project
    editProject: async (project_id, updateFields) => {
        return new Promise(async (resolve, reject) => {
            try {
                const filteredFields = validatePartial(projectValidation, updateFields);
                // Filter out null or undefined fields
                db.get().collection(COLLECTION.PROJECTS).updateOne(
                    { _id: ObjectId(project_id) },
                    { $set: filteredFields }
                ).then(result => {
                    if (result.modifiedCount > 0) {
                        resolve(true);
                    } else {
                        reject("Update failed or no changes made");
                    }
                }).catch(err => {

                    reject("Error processing request");
                });
            } catch (err) {

                reject(err || "Error processing request");
            }
        });
    },
    // // Get Client List  
    getProjectList: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                resolve(await db.get().collection(COLLECTION.PROJECTS).find({ status: { $ne: STATUSES.DELETED } }).toArray());

            } catch (err) {
                console.error(err);
                reject(err || "Error fetching client list");
            }
        });
    },
    deletePoject: async (projectId) => {
        return new Promise(async (resolve, reject) => {
            try {
                db.get().collection(COLLECTION.PROJECTS).updateOne(
                    { _id: ObjectId(projectId) },
                    { $set: { status: STATUSES.DELETED, updated_at: new Date() } }
                ).then(result => {
                    if (result.modifiedCount > 0) {
                        resolve(true);
                    } else {
                        reject("Delete failed or project not found");
                    }
                }).catch(err => {
                    console.error(err);
                    reject("Error deleting project");
                });
            } catch (err) {
                console.error(err);
                reject(err || "Error deleting client");
            }
        });
    },

    createVacancy: async (details) => {
        return new Promise(async (resolve, reject) => {
            try {
                const { error, value } = vacancyValidation.validate(details);
                if (error) {
                    return reject(`Validation Error: ${error.message}`);
                }
                const { clients = [], ...vacancyData } = value;
                // Format clients with ObjectId and commission history
                const formattedClients = clients.map(client => ({
                    client_id: ObjectId(client.client_id),
                    vacancies: client.vacancies,
                    commission_history: [
                        {
                            value: client.commission,
                            updated_at: new Date()
                        }
                    ]
                }));
                const documentToInsert = {
                    ...vacancyData,
                    project_id: ObjectId(vacancyData.project_id),
                    clients: formattedClients,
                    created_at: new Date(),
                    status: STATUSES.ACTIVE
                };

                const result = await db.get().collection(COLLECTION.VACANCIES).insertOne(documentToInsert);
                resolve(result.insertedId);

            } catch (err) {
                console.error(err);
                reject(err?.message || 'Error creating vacancy');
            }
        });
    },

    editVacancy: async (_id, data) => {
        return new Promise((resolve, reject) => {
            const updateFields = validatePartial(vacancyValidation, data);;
            if (updateFields.project_id != null) {
                updateFields.project_id = ObjectId(updateFields.project_id);
            }
            db.get().collection(COLLECTION.VACANCIES).updateOne(
                { _id: ObjectId(_id) },
                { $set: updateFields }
            ).then(result => {
                if (result.matchedCount === 0) {
                    reject("Vacancy not found");
                } else if (result.modifiedCount > 0) {
                    resolve(true);
                } else {
                    reject("No changes made");
                }
            }).catch(err => {
                reject(err || "Error updating vacancy");
            });
        });
    },
    insertClientsToVacancy: async (vacancyId, clients) => {
        try {
            const { clients: validatedClients } = validatePartial(vacancyValidation, { clients });

            const vacancy = await db.get().collection(COLLECTION.VACANCIES).findOne(
                { _id: ObjectId(vacancyId) },
                { projection: { clients: 1 } }
            );

            const existingIds = new Set((vacancy?.clients || []).map(c => c.client_id.toString()));

            const newClients = validatedClients
                .filter(c => !existingIds.has(c.client_id.toString()))
                .map(c => ({
                    ...c,
                    client_id: ObjectId(c.client_id), 
                    commission_history: [
                        {
                            value: c.commission,
                            updated_at: new Date()
                        }
                    ]
                }));

            if (newClients.length > 0) {
                await db.get().collection(COLLECTION.VACANCIES).updateOne(
                    { _id: ObjectId(vacancyId) },
                    { $push: { clients: { $each: newClients } } }
                );
            }

            return true;
        } catch (err) {
            console.error(err);
            throw err || "Client insert failed";
        }
    },

    removeClientFromVacancy: async (vacancyId, clientId) => {
        return new Promise(async (resolve, reject) => {
            try {
                db.get().collection(COLLECTION.VACANCIES).updateOne(
                    { _id: ObjectId(vacancyId) },
                    {
                        $pull: {
                            clients: {
                                client_id: ObjectId(clientId)
                            }
                        }
                    }
                ).then(result => {
                    if (result.modifiedCount > 0) {
                        resolve(true);
                    } else {
                        reject("Client not found or already removed");
                    }
                }).catch(err => {
                    reject("Error removing client");
                });
            } catch (err) {
                reject(err || "Error removing client");
            }
        });
    },
    editClientsInVacancy: async (vacancyId, clients) => {
        return new Promise(async (resolve, reject) => {
            try {
                // if (!Array.isArray(clientsToUpdate)) {
                //     return reject("Invalid clients input; expected an array");
                // }
             var   clientsToUpdate = validatePartial(vacancyValidation, { clients });
                const vacancy = await db.get().collection(COLLECTION.VACANCIES).findOne({
                    _id: ObjectId(vacancyId)
                });

                if (!vacancy) return reject("Vacancy not found");

                const bulkOps = [];

                for (const updatedClient of clientsToUpdate.clients) {
                    const clientIndex = vacancy.clients.findIndex(
                        c => c.client_id.toString() === updatedClient.client_id
                    );

                    if (clientIndex === -1) continue; // skip if client not found

                    const dbClient = vacancy.clients[clientIndex];
                    const now = new Date();

                    const latestCommission = dbClient.commission_history?.at(-1)?.value;
                    const isCommissionChanged = updatedClient.commission !== latestCommission;

                    const isVacancyChanged = JSON.stringify(dbClient.vacancies) !== JSON.stringify(updatedClient.vacancies);

                    if (!isCommissionChanged && !isVacancyChanged) continue; // nothing changed

                    const updateOps = {};

                    if (isVacancyChanged) {
                        updateOps.$set = {
                            [`clients.${clientIndex}.vacancies`]: updatedClient.vacancies
                        };
                    }

                    if (isCommissionChanged) {
                        updateOps.$push = {
                            [`clients.${clientIndex}.commission_history`]: {
                                value: updatedClient.commission,
                                updated_at: now
                            }
                        };
                    }

                    bulkOps.push({
                        updateOne: {
                            filter: { _id: ObjectId(vacancyId) },
                            update: updateOps
                        }
                    });
                }

                if (bulkOps.length === 0) return resolve("No updates necessary");

                await db.get().collection(COLLECTION.VACANCIES).bulkWrite(bulkOps);
                resolve(true);
            } catch (err) {
                console.error(err);
                reject(err || "Error updating clients");
            }
        });
    },

    deleteVacancy: async (vacancyId) => {
        return new Promise(async (resolve, reject) => {
            try {
                db.get().collection(COLLECTION.VACANCIES).updateOne(
                    { _id: ObjectId(vacancyId) },
                    { $set: { status: STATUSES.DELETED, updated_at: new Date() } }
                ).then(result => {
                    if (result.modifiedCount > 0) resolve(true);
                    else reject("Delete failed or not found");
                }).catch(err => {
                    console.error(err);
                    reject("Error deleting vacancy");
                });
            } catch (err) {
                console.error(err);
                reject(err || "Error deleting vacancy");
            }
        });
    },

    getVacancyList: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                const result = await db.get().collection(COLLECTION.VACANCIES).aggregate([
                    { $match: { status: "ACTIVE" } },

                    {
                        $lookup: {
                            from: COLLECTION.PROJECTS,
                            localField: "project_id",
                            foreignField: "_id",
                            as: "project"
                        }
                    },
                    { $unwind: "$project" },

                    // Step 1: Flatten all client vacancies into a single array
                    {
                        $addFields: {
                            all_vacancies_array: {
                                $reduce: {
                                    input: "$clients",
                                    initialValue: [],
                                    in: {
                                        $concatArrays: [
                                            "$$value",
                                            {
                                                $map: {
                                                    input: { $objectToArray: "$$this.vacancies" },
                                                    as: "item",
                                                    in: {
                                                        k: "$$item.k",
                                                        v: {
                                                            $cond: [
                                                                { $in: [{ $type: "$$item.v" }, ["object"]] },
                                                                "$$item.v",
                                                                { count: "$$item.v", target_cv: 0 }
                                                            ]

                                                        }
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    },

                    // Step 2: Group by specialization and sum values
                    {
                        $addFields: {
                            specialization_totals: {
                                $arrayToObject: {
                                    $reduce: {
                                        input: "$all_vacancies_array",
                                        initialValue: [],
                                        in: {
                                            $let: {
                                                vars: {
                                                    existing: {
                                                        $filter: {
                                                            input: "$$value",
                                                            as: "item",
                                                            cond: { $eq: ["$$item.k", "$$this.k"] }
                                                        }
                                                    }
                                                },
                                                in: {
                                                    $cond: [
                                                        { $gt: [{ $size: "$$existing" }, 0] },
                                                        {
                                                            $map: {
                                                                input: "$$value",
                                                                as: "item",
                                                                in: {
                                                                    $cond: [
                                                                        { $eq: ["$$item.k", "$$this.k"] },
                                                                        {
                                                                            k: "$$item.k",
                                                                            v: {
                                                                                count: { $add: ["$$item.v.count", "$$this.v.count"] },
                                                                                target_cv: { $add: ["$$item.v.target_cv", "$$this.v.target_cv"] }
                                                                            }
                                                                        },
                                                                        "$$item"
                                                                    ]
                                                                }
                                                            }
                                                        },
                                                        {
                                                            $concatArrays: [
                                                                "$$value",
                                                                [{ k: "$$this.k", v: "$$this.v" }]
                                                            ]
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },

                    // Step 3: Sum total count and total target_cv
                    {
                        $addFields: {
                            total_vacancies: {
                                $sum: {
                                    $map: {
                                        input: { $objectToArray: "$specialization_totals" },
                                        as: "s",
                                        in: "$$s.v.count"
                                    }
                                }
                            },
                            total_target_cv: {
                                $sum: {
                                    $map: {
                                        input: { $objectToArray: "$specialization_totals" },
                                        as: "s",
                                        in: "$$s.v.target_cv"
                                    }
                                }
                            }
                        }
                    },
                    {
                        $addFields: {
                            specialization_totals: {
                                $map: {
                                    input: { $objectToArray: "$specialization_totals" },
                                    as: "item",
                                    in: {
                                        specialization: "$$item.k",
                                        count: "$$item.v.count",
                                        target_cv: "$$item.v.target_cv"
                                    }
                                }
                            }
                        }
                    },
                    // Step 4: Project the final output
                    {
                        $project: {
                            job_title: 1,
                            job_category: 1,
                            qualifications: 1,
                            experience: 1,
                            salary_from: 1,
                            salary_to: 1,
                            status: 1,
                            lastdatetoapply: 1,
                            description: 1,
                            country: 1,
                            city: 1,
                            project: {
                                _id: 1,
                                project_name: 1,
                                organization_type: 1,
                                organization_category: 1,
                                organization_name: 1,
                                country: 1,
                                city: 1
                            },
                            total_vacancies: 1,
                            total_target_cv: 1,
                            specialization_totals: 1
                        }
                    }
                ]).toArray();

                resolve(result);
            } catch (err) {
                console.error(err);
                reject(err || "Error fetching vacancy list");
            }
        });
    },


    getClientDetailsWithVacancyData: async (vacancyId) => {
        return new Promise(async (resolve, reject) => {
            try {
                const result = await db.get().collection(COLLECTION.VACANCIES).aggregate([
                    {
                        $match: { _id: ObjectId(vacancyId) }
                    },
                    {
                        $unwind: "$clients"
                    },
                    {
                        $lookup: {
                            from: COLLECTION.CLIENTS,
                            localField: "clients.client_id",
                            foreignField: "_id",
                            as: "client_info"
                        }
                    },
                    {
                        $unwind: "$client_info"
                    },
                    {
                        $project: {
                            _id: 0,
                            client_id: "$clients.client_id",
                            vacancies: "$clients.vacancies",
                            commission_history: "$clients.commission_history",
                            client_info: {
                                _id: "$client_info._id",
                                name: "$client_info.name",
                                email: "$client_info.email",
                                phone: "$client_info.phone",
                                company_name: "$client_info.company_name",
                                address: "$client_info.address",
                                city: "$client_info.city",
                                country: "$client_info.country",
                                status: "$client_info.status"
                                // Add/remove any fields you need from the client doc
                            }
                        }
                    }
                ]).toArray();

                resolve(result);
            } catch (err) {
                console.error(err);
                reject(err || "Error fetching client details for vacancy");
            }
        });
    },

    getVacancyMatchingProfiles: async (vacancyId) => {
        return new Promise(async (resolve, reject) => {
            try {
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

                // Get data from LEADS (from db1)
                const leadsPromise = db.get().collection(COLLECTION.LEADS)
                    .find()
                    .project(projection)
                    .toArray();

                // Get data from CUSTOMERS (from db2)
                const customersPromise = db.get().collection(COLLECTION.CUSTOMERS)
                    .find()
                    .project(projection)
                    .toArray();

                // Await both promises in parallel
                const [leads, customers] = await Promise.all([leadsPromise, customersPromise]);
                // Combine both datasets
                const combined = [...leads, ...customers];
                resolve(combined);
            } catch (err) {

                reject(err || "Error fetching data from leads and customers");
            }
        });
    },







    // // Edit Project
    // editVacancy: async (projectId, updateFields) => {
    //     return new Promise(async (resolve, reject) => {
    //         try {

    //             const result = await db.get().collection(COLLECTION.PROJECTS).updateOne(
    //                 { _id: ObjectId(projectId) },
    //                 { $set: updateFields }
    //             );
    //             if (result.modifiedCount > 0) {
    //                 resolve(true);
    //             } else {
    //                 reject("Update failed or no changes made");
    //             }
    //         } catch (err) {
    //             console.error(err);
    //             reject("Error processing request");
    //         }
    //     });
    // },


    // addClientToVacancy: async (projectId, clientList) => {
    //     return new Promise(async (resolve, reject) => {
    //         try {

    //             // Calculate total vacancies fromclientList
    //             const totalVacancies = clientList.reduce((sum, client) => {
    //                 return sum + (parseInt(client.vacancies) || 0);
    //             }, 0);

    //             // Prepare clientList: convert _id to ObjectId and rename to client, remove _id
    //             const clientsToPush = clientList.map(client => {
    //                 const { _id, ...rest } = client;
    //                 return {
    //                     ...rest,
    //                     _id: ObjectId(_id)
    //                 };
    //             });

    //             // Push new clients to the existing client array, and update total_vacancies
    //             const result = await db.get().collection(COLLECTION.PROJECTS).updateOne(
    //                 { _id: ObjectId(projectId) }, // Filter by _id
    //                 {
    //                     $push: { client: { $each: clientsToPush } },
    //                     $inc: { total_vacancies: totalVacancies }
    //                 }
    //             );

    //             if (result.modifiedCount > 0) {
    //                 resolve(true);
    //             } else {
    //                 reject("Update failed or no changes made");
    //             }
    //         } catch (err) {
    //             console.error(err);
    //             reject("Error processing request");
    //         }
    //     });
    // },
    // editVacancyClient: async (projectId, clientId, updateFields) => {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             const projectCollection = db.get().collection(COLLECTION.VACANCIES);

    //             // Update the specificclient in the client array
    //             const result = await projectCollection.updateOne(
    //                 { _id: ObjectId(projectId), "client._id": ObjectId(clientId) },
    //                 {
    //                     $set: Object.fromEntries(
    //                         Object.entries(updateFields).map(([key, value]) => [`client.$.${key}`, value])
    //                     )
    //                 }
    //             );

    //             if (result.modifiedCount > 0) {
    //                 // If vacancies changed, recalculate total_vacancies
    //                 if (updateFields.vacancies !== undefined) {
    //                     const project = await projectCollection.findOne({ _id: ObjectId(projectId) });
    //                     const totalVacancies = (project.client || []).reduce((sum, c) => {
    //                         return sum + (parseInt(c.vacancies) || 0);
    //                     }, 0);
    //                     await projectCollection.updateOne(
    //                         { _id: ObjectId(projectId) },
    //                         { $set: { total_vacancies: totalVacancies } }
    //                     );
    //                 }
    //                 resolve(true);
    //             } else {
    //                 reject("Update failed or no changes made");
    //             }
    //         } catch (err) {
    //             console.error(err);
    //             reject("Error processing request");
    //         }
    //     });
    // },

    // removeClientFromVacancy: async (projectId, clientId) => {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             const collection = db.get().collection(COLLECTION.VACANCIES);
    //             // Find the project to get the current client list
    //             const project = await collection.findOne({ _id: ObjectId(projectId) });
    //             if (!project) return reject("Project not found");

    //             // Find the client to remove and get its vacancies
    //             const clientToRemove = (project.client || []).find(
    //                 c => c._id && c._id.toString() === clientId
    //             );
    //             const vacanciesToSubtract = clientToRemove ? (parseInt(clientToRemove.vacancies) || 0) : 0;

    //             // Remove the client from the client array
    //             const result = await collection.updateOne(
    //                 { _id: ObjectId(projectId) },
    //                 {
    //                     $pull: { client: { _id: ObjectId(clientId) } },
    //                     $inc: { total_vacancies: -vacanciesToSubtract }
    //                 }
    //             );

    //             if (result.modifiedCount > 0) {
    //                 resolve(true);
    //             } else {
    //                 reject("Delete failed or client not found in project");
    //             }
    //         } catch (err) {
    //             console.error(err);
    //             reject("Error deleting client from project");
    //         }
    //     },
    //     )
    // },

    // getlatestVacancyList: async () => {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             // Use only the date part for comparison (ignore time)
    //             const today = new Date();
    //             today.setHours(0, 0, 0, 0);

    //             // Use $expr to compare only the date part of lastdatetoapply
    //             const projects = await db.get().collection(COLLECTION.VACANCIES).find(
    //                 {
    //                     $expr: {
    //                         $gte: [
    //                             {
    //                                 $dateFromString: {
    //                                     dateString: { $substr: ["$lastdatetoapply", 0, 10] }
    //                                 }
    //                             },
    //                             today
    //                         ]
    //                     }
    //                 },
    //                 {
    //                     projection: {
    //                         client: 0,
    //                     }
    //                 }
    //             ).toArray();
    //             resolve(projects);
    //         } catch (err) {
    //             console.error(err);
    //             reject("Error fetching project list");
    //         }
    //     });
    // },
    // getAllVacancy: async () => {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             const projects = await db.get().collection(COLLECTION.VACANCIES).find({}, {
    //                 projection: {
    //                     client: 0,
    //                 }
    //             }).toArray();
    //             resolve(projects);
    //         } catch (err) {
    //             console.error(err);
    //             reject("Error fetching all projects");
    //         }
    //     });
    // },
    // getVacancyDeatils: async (projectId) => {
    //     return new Promise(async (resolve, reject) => {
    //         try {
    //             const collection = db.get().collection(COLLECTION.VACANCIES);
    //             const project = await collection.findOne();
    //             if (!project) return reject("Project not found");
    //             resolve(project);
    //         } catch (err) {
    //             console.error(err);
    //             reject("Error fetching project list");
    //         }
    //     });
    // },
    //  getVacancyListWithClientDetails: async (projectId) => {
    //     return new Promise(async (resolve, reject) => {

    //         try {
    //             const projects = await db.get().collection(COLLECTION.VACANCIES).aggregate([
    //                 { $match: { _id: ObjectId(projectId) } },
    //                 {
    //                     $lookup: {
    //                         from: COLLECTION.CLIENTS,
    //                         localField: "client._id",
    //                         foreignField: "_id",
    //                         as: "client_details"
    //                     }
    //                 },
    //                 {
    //                     $addFields: {
    //                         client: {
    //                             $map: {
    //                                 input: "$client",
    //                                 as: "projClient",
    //                                 in: {
    //                                     $mergeObjects: [
    //                                         "$$projClient",
    //                                         {
    //                                             client_info: {
    //                                                 $let: {
    //                                                     vars: {
    //                                                         cd: {
    //                                                             $arrayElemAt: [
    //                                                                 {
    //                                                                     $filter: {
    //                                                                         input: "$client_details",
    //                                                                         as: "cd",
    //                                                                         cond: { $eq: ["$$cd._id", "$$projClient._id"] }
    //                                                                     }
    //                                                                 },
    //                                                                 0
    //                                                             ]
    //                                                         }
    //                                                     },
    //                                                     in: {
    //                                                         client_id: "$$cd.client_id",
    //                                                         name: "$$cd.name",
    //                                                         email: "$$cd.email",
    //                                                         phone: "$$cd.phone"
    //                                                     }
    //                                                 }
    //                                             }
    //                                         }
    //                                     ]
    //                                 }
    //                             }
    //                         }
    //                     }
    //                 },
    //                 { $project: { client_details: 0 } }
    //             ]).toArray();
    //             resolve(projects);
    //         } catch (err) {
    //             console.error(err);
    //             reject("Error fetching project list with client details");
    //         }
    //     });
    // },


}