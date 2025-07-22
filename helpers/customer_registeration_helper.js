var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const { DESIGNATIONS, STATUSES } = require('../constants/enums');
const { customerBasicInfoValidation, academicValidation, examValidation, travelHistoryValidation, workHistoryValidation, } = require('../validations/registerationValidation');

module.exports = {
    getRegisterdCustomers: async (filters) => {
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
                const LEADS = await db.get().collection(COLLECTION.CUSTOMERS).find().project({
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

    updateCustomerBasicInfo: async (id, data) => {
        try {
            const { error, value } = customerBasicInfoValidation.validate(data);
            if (error) throw new Error("Validation failed: " + error.details[0].message);
            return db.get().collection(COLLECTION.CUSTOMERS).updateOne(
                { _id: ObjectId(id) },
                { $set: { ...value, updated_at: new Date() } }
            ).then(updateResult => {
                if (updateResult.matchedCount === 0) {
                    throw new Error("Customer not found");
                }
                return { success: true, message: "Customer updated successfully" };
            });
        } catch (err) {
            throw new Error("Error updating Customer: " + err.message || err);
        }
    },
    updateCustomerAcademicRecords: async (id, academicList) => {
        try {

            // Validate each academic record and build new validated list
            const validatedList = academicList.map((record) => {
                const { error, value } = academicValidation.validate(record);
                if (error) {
                    throw new Error(`Validation failed for qualification "${record.qualification}": ${error.details[0].message}`);
                }
                return {
                    ...value
                };
            });
            // Update customer document with new academic_records list
            return db.get().collection(COLLECTION.CUSTOMERS).updateOne(
                { _id: ObjectId(id) },
                {
                    $set: {
                        academic_records: validatedList,
                        updated_at: new Date()
                    }
                }
            ).then(result => {
                if (result.matchedCount === 0) {
                    throw new Error("Customer not found");
                }
                return { success: true, message: "Academic records updated successfully" };
            });
        } catch (err) {
            throw new Error("Error updating academic records: " + (err.message || err));
        }

    },


    updateCustomerExamRecords: async (id, examList) => {
        try {
            // Validate each exam record and build new validated list
            const validatedList = examList.map((record) => {
                const { error, value } = examValidation.validate(record);
                if (error) {
                    throw new Error(`Validation failed for exam "${record.exam}": ${error.details[0].message}`);
                }
                return {
                    ...value
                };
            });
            // Update customer document with new exam_records list
            return db.get().collection(COLLECTION.CUSTOMERS).updateOne(
                { _id: ObjectId(id) },
                {
                    $set: {
                        exam_records: validatedList,
                        updated_at: new Date()
                    }
                }
            ).then(result => {
                if (result.matchedCount === 0) {
                    throw new Error("Customer not found");
                }
                return { success: true, message: "Exam records updated successfully" };
            });
        } catch (err) {
            throw new Error("Error updating exam records: " + (err.message || err));
        }

    },

    updateCustomerTravelHistoryRecords: async (id, travelList) => {
        try {
            // Validate each travel record and build new validated list
            const validatedList = travelList.map((record) => {
                const { error, value } = travelHistoryValidation.validate(record);
                if (error) {
                    throw new Error(`Validation failed for travel record "${record.country}": ${error.details[0].message}`);
                }
                return {
                    ...value
                };
            });
            // Update customer document with new travel_history_records list
            return db.get().collection(COLLECTION.CUSTOMERS).updateOne(
                { _id: ObjectId(id) },
                {
                    $set: {
                        travel_records: validatedList,
                        updated_at: new Date()
                    }
                }
            ).then(result => {
                if (result.matchedCount === 0) {
                    throw new Error("Customer not found");
                }
                return { success: true, message: "Travel history records updated successfully" };
            });
        } catch (err) {
            throw new Error("Error updating travel history records: " + (err.message || err));
        }
    },
     updateCustomerWorkHistoryRecords : async (id, workList) => {
        try {
            // Validate all work records and convert date fields
            const validatedList = workList.map((record) => {
                const { error, value } = workHistoryValidation.validate(record);
                if (error) {
                    throw new Error(`Validation failed for company "${record.organization}": ${error.details[0].message}`);
                }

                return {
                    ...record,
                    from_date: value.start_date || null,
                    to_date: value.end_date || null,
                };
            });

            // Sort records by from_date (first job date is earliest)
            const sortedByStartDate = [...validatedList].filter(x => x.from_date).sort(
                (a, b) => new Date(a.from_date) - new Date(b.from_date)
            );

            const firstJobDate = sortedByStartDate[0]?.from_date || null;

            // Calculate gaps between end of one job and start of next
            const jobGapsInMonths = [];
            for (let i = 1; i < sortedByStartDate.length; i++) {
                const prev = sortedByStartDate[i - 1];
                const current = sortedByStartDate[i];

                const prevEnd = new Date(prev.to_date || prev.from_date);  // fallback if to_date missing
                const currStart = new Date(current.from_date);

                if (prevEnd > currStart) continue; // overlapping jobs

                const yearDiff = currStart.getFullYear() - prevEnd.getFullYear();
                const monthDiff = currStart.getMonth() - prevEnd.getMonth();
                const totalMonths = yearDiff * 12 + monthDiff;

                jobGapsInMonths.push(totalMonths);
            }

            // Final update to MongoDB
            const result = await db.get().collection(COLLECTION.CUSTOMERS).updateOne(
                { _id: ObjectId(id) },
                {
                    $set: {
                        work_records: validatedList,
                        first_job_date: firstJobDate,
                        job_gap_months: jobGapsInMonths[0] || 0, // Use first gap or 0 if no gaps
                        updated_at: new Date(),
                    },
                }
            );

            if (result.matchedCount === 0) {
                throw new Error("Customer not found");
            }

            return { success: true, message: "Work history records updated successfully" };

        } catch (err) {
            throw new Error("Error updating work history records: " + (err.message || err));
        }
    },


}