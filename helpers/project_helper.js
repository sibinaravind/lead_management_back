var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;

// Helper to get next sequence number

module.exports = {
    // Create Client
    createClient: async (details) => {
        return new Promise(async (resolve, reject) => {
            try {
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
                const newNumber = await getNextSequence('client_id');
                const client_id = `AECID${String(newNumber).padStart(5, '0')}`;


                const result = await collection.insertOne({
                    client_id: client_id,
                    name: details.name,
                    email: details.email,
                    phone: details.phone,
                    alternate_phone: details.alternate_phone,
                    address: details.address,
                    city: details.city,
                    state: details.state,
                    country: details.country,
                    status: 'active',
                    created_at: new Date()
                });
                if (result.acknowledged) {
                    return resolve(result.insertedId);
                } else {
                    reject("Insert failed");
                }
            } catch (err) {
                console.error(err);
                reject("Error processing request");
            }
        });
    },

    // Edit Client
    editClient: async (clientId, updateFields) => {
        return new Promise(async (resolve, reject) => {
            try {

                const result = await db.get().collection(COLLECTION.CLIENTS).updateOne(
                    { _id: ObjectId(clientId) },
                    { $set: updateFields }
                );
                if (result.modifiedCount > 0) {
                    resolve(true);
                } else {
                    reject("Update failed or no changes made");
                }
            } catch (err) {
                console.error(err);
                reject("Error processing request");
            }
        });
    },

    // Get Client List  
    getClientList: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                const clients = await db.get().collection(COLLECTION.CLIENTS).find({ status: { $ne: 'deleted' } }).toArray();
                resolve(clients);
            } catch (err) {
                console.error(err);
                reject("Error fetching client list");
            }
        }); ``
    },


    // Create Job Vacancy as Project using next unique sequence
    createVacancy: async (details) => {
        return new Promise(async (resolve, reject) => {
            try {
                const collection = db.get().collection(COLLECTION.VACANCIES);
                // Get next project number atomically
                const newNumber = await getNextSequence('vacancy_id');
                const vacancy_id = `AEVID${String(newNumber).padStart(5, '0')}`;
                // Insert job vacancy as a project
                const result = await collection.insertOne({
                    vacancy_id: vacancy_id,
                    job_title: details.job_title,
                    job_category: details.job_category,
                    qualifications: details.qualifications,
                    experience: details.experience,
                    skills: details.skills,
                    salary: details.salary,
                    total_vacancies: details.total_vacancies || 0,
                    client: details.client || [],
                    lastdatetoapply: details.lastdatetoapply,
                    status: details.status || 'active',
                    description: details.description,
                    nation: details.nation,
                    city: details.city,
                    created_at: new Date()
                });
                if (result.acknowledged) {
                    resolve(result.insertedId);
                } else {
                    reject("Insert failed");
                }
            } catch (err) {
                console.error(err);
                reject("Error processing request");
            }
        });
    },

    // Edit Project
    editVacancy: async (projectId, updateFields) => {
        return new Promise(async (resolve, reject) => {
            try {

                const result = await db.get().collection(COLLECTION.PROJECTS).updateOne(
                    { _id: ObjectId(projectId) },
                    { $set: updateFields }
                );
                if (result.modifiedCount > 0) {
                    resolve(true);
                } else {
                    reject("Update failed or no changes made");
                }
            } catch (err) {
                console.error(err);
                reject("Error processing request");
            }
        });
    },


    addClientToVacancy: async (projectId, clientList) => {
        return new Promise(async (resolve, reject) => {
            try {

                // Calculate total vacancies fromclientList
                const totalVacancies = clientList.reduce((sum, client) => {
                    return sum + (parseInt(client.vacancies) || 0);
                }, 0);

                // Prepare clientList: convert _id to ObjectId and rename to client, remove _id
                const clientsToPush = clientList.map(client => {
                    const { _id, ...rest } = client;
                    return {
                        ...rest,
                        _id: ObjectId(_id)
                    };
                });

                // Push new clients to the existing client array, and update total_vacancies
                const result = await db.get().collection(COLLECTION.PROJECTS).updateOne(
                    { _id: ObjectId(projectId) }, // Filter by _id
                    {
                        $push: { client: { $each: clientsToPush } },
                        $inc: { total_vacancies: totalVacancies }
                    }
                );

                if (result.modifiedCount > 0) {
                    resolve(true);
                } else {
                    reject("Update failed or no changes made");
                }
            } catch (err) {
                console.error(err);
                reject("Error processing request");
            }
        });
    },
    editVacancyClient: async (projectId, clientId, updateFields) => {
        return new Promise(async (resolve, reject) => {
            try {
                const projectCollection = db.get().collection(COLLECTION.VACANCIES);

                // Update the specificclient in the client array
                const result = await projectCollection.updateOne(
                    { _id: ObjectId(projectId), "client._id": ObjectId(clientId) },
                    {
                        $set: Object.fromEntries(
                            Object.entries(updateFields).map(([key, value]) => [`client.$.${key}`, value])
                        )
                    }
                );

                if (result.modifiedCount > 0) {
                    // If vacancies changed, recalculate total_vacancies
                    if (updateFields.vacancies !== undefined) {
                        const project = await projectCollection.findOne({ _id: ObjectId(projectId) });
                        const totalVacancies = (project.client || []).reduce((sum, c) => {
                            return sum + (parseInt(c.vacancies) || 0);
                        }, 0);
                        await projectCollection.updateOne(
                            { _id: ObjectId(projectId) },
                            { $set: { total_vacancies: totalVacancies } }
                        );
                    }
                    resolve(true);
                } else {
                    reject("Update failed or no changes made");
                }
            } catch (err) {
                console.error(err);
                reject("Error processing request");
            }
        });
    },

    removeClientFromVacancy: async (projectId, clientId) => {
        return new Promise(async (resolve, reject) => {
            try {
                const collection = db.get().collection(COLLECTION.VACANCIES);
                // Find the project to get the current client list
                const project = await collection.findOne({ _id: ObjectId(projectId) });
                if (!project) return reject("Project not found");

                // Find the client to remove and get its vacancies
                const clientToRemove = (project.client || []).find(
                    c => c._id && c._id.toString() === clientId
                );
                const vacanciesToSubtract = clientToRemove ? (parseInt(clientToRemove.vacancies) || 0) : 0;

                // Remove the client from the client array
                const result = await collection.updateOne(
                    { _id: ObjectId(projectId) },
                    {
                        $pull: { client: { _id: ObjectId(clientId) } },
                        $inc: { total_vacancies: -vacanciesToSubtract }
                    }
                );

                if (result.modifiedCount > 0) {
                    resolve(true);
                } else {
                    reject("Delete failed or client not found in project");
                }
            } catch (err) {
                console.error(err);
                reject("Error deleting client from project");
            }
        },
        )
    },

    getlatestVacancyList: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                // Use only the date part for comparison (ignore time)
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                // Use $expr to compare only the date part of lastdatetoapply
                const projects = await db.get().collection(COLLECTION.VACANCIES).find(
                    {
                        $expr: {
                            $gte: [
                                {
                                    $dateFromString: {
                                        dateString: { $substr: ["$lastdatetoapply", 0, 10] }
                                    }
                                },
                                today
                            ]
                        }
                    },
                    {
                        projection: {
                            client: 0,
                        }
                    }
                ).toArray();
                resolve(projects);
            } catch (err) {
                console.error(err);
                reject("Error fetching project list");
            }
        });
    },
    getAllVacancy: async () => {
        return new Promise(async (resolve, reject) => {
            try {
                const projects = await db.get().collection(COLLECTION.VACANCIES).find({}, {
                    projection: {
                        client: 0,
                    }
                }).toArray();
                resolve(projects);
            } catch (err) {
                console.error(err);
                reject("Error fetching all projects");
            }
        });
    },
    getVacancyDeatils: async (projectId) => {
        return new Promise(async (resolve, reject) => {
            try {
                const collection = db.get().collection(COLLECTION.VACANCIES);
                const project = await collection.findOne();
                if (!project) return reject("Project not found");
                resolve(project);
            } catch (err) {
                console.error(err);
                reject("Error fetching project list");
            }
        });
    },
     getVacancyListWithClientDetails: async (projectId) => {
        return new Promise(async (resolve, reject) => {
          
            try {
                const projects = await db.get().collection(COLLECTION.VACANCIES).aggregate([
                    { $match: { _id: ObjectId(projectId) } },
                    {
                        $lookup: {
                            from: COLLECTION.CLIENTS,
                            localField: "client._id",
                            foreignField: "_id",
                            as: "client_details"
                        }
                    },
                    {
                        $addFields: {
                            client: {
                                $map: {
                                    input: "$client",
                                    as: "projClient",
                                    in: {
                                        $mergeObjects: [
                                            "$$projClient",
                                            {
                                                client_info: {
                                                    $let: {
                                                        vars: {
                                                            cd: {
                                                                $arrayElemAt: [
                                                                    {
                                                                        $filter: {
                                                                            input: "$client_details",
                                                                            as: "cd",
                                                                            cond: { $eq: ["$$cd._id", "$$projClient._id"] }
                                                                        }
                                                                    },
                                                                    0
                                                                ]
                                                            }
                                                        },
                                                        in: {
                                                            client_id: "$$cd.client_id",
                                                            name: "$$cd.name",
                                                            email: "$$cd.email",
                                                            phone: "$$cd.phone"
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
                    { $project: { client_details: 0 } }
                ]).toArray();
                resolve(projects);
            } catch (err) {
                console.error(err);
                reject("Error fetching project list with client details");
            }
        });
    },


}