let COLLECTION = require('../config/collections')
var db = require('../config/connection');
async function getNextSequence(name) {
    const result = await db.get().collection(COLLECTION.COUNTER).findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" }
    );
    return String(result.value.seq).padStart(5, '0');
}

module.exports = { getNextSequence };
