var db = require('../config/connection');
let COLLECTION = require('../config/collections')
const { ObjectId } = require('mongodb');
const { DESIGNATIONS, STATUSES } = require('../constants/enums');
const { logActivity } = require('./customer_interaction_helper');
const getNextSequence = require('../utils/get_next_unique').getNextSequence;

module.exports = {



}