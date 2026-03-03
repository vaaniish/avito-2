"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toClientRole = toClientRole;
exports.toClientCondition = toClientCondition;
exports.toPartnerListingStatus = toPartnerListingStatus;
exports.toAdminListingStatus = toAdminListingStatus;
exports.toProfileOrderStatus = toProfileOrderStatus;
exports.toQuestionStatus = toQuestionStatus;
function toClientRole(role) {
    if (role === "ADMIN")
        return "admin";
    if (role === "SELLER")
        return "partner";
    return "regular";
}
function toClientCondition(condition) {
    return condition === "NEW" ? "new" : "used";
}
function toPartnerListingStatus(status) {
    if (status === "INACTIVE")
        return "inactive";
    if (status === "MODERATION")
        return "moderation";
    return "active";
}
function toAdminListingStatus(moderationStatus) {
    if (moderationStatus === "APPROVED")
        return "approved";
    if (moderationStatus === "REJECTED")
        return "rejected";
    return "pending";
}
function toProfileOrderStatus(status) {
    if (status === "COMPLETED")
        return "completed";
    if (status === "CANCELLED")
        return "cancelled";
    if (status === "SHIPPED")
        return "shipped";
    return "processing";
}
function toQuestionStatus(status) {
    return status === "ANSWERED" ? "answered" : "pending";
}
//# sourceMappingURL=format.js.map