
const { safeObjectId } = require('../utils/safeObjectId');
const buildOfficerMatch = (decoded = {}, employee, fieldName) => {
    const isAdmin =
        Array.isArray(decoded?.designation) &&
        decoded.designation.includes("ADMIN");
    const toObjectId = (id) => {
        try {
            return safeObjectId(id);
        } catch {
            return null;
        }
    };

    if (employee) {
        const empId = toObjectId(employee);
        if (!empId) return {};
        return fieldName === "officers"
            ? { [fieldName]: { $in: [empId] } }
            : { [fieldName]: empId };
    }
    if (isAdmin) {
        return {};
    }

    /* ================= NON-ADMIN USER ================= */
    const officerIds = [];

    // Logged-in user
    const selfId = toObjectId(decoded?._id);
    if (selfId) officerIds.push(selfId);

    // Extra linked officers (if any)
    if (Array.isArray(decoded?.officers)) {
        decoded.officers.forEach(o => {
            const id = toObjectId(o?.officer_id || o);
            if (id) officerIds.push(id);
        });
    }

    if (officerIds.length === 0) return {};

    return fieldName === "officers"
        ? { [fieldName]: { $in: officerIds } }
        : { [fieldName]: { $in: officerIds } };
};

module.exports = { buildOfficerMatch };