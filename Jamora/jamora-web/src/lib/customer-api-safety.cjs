function safeCustomer(value) {
  if (!value || typeof value !== "object") return null;
  if (
    typeof value.documentId !== "string" ||
    typeof value.name !== "string" ||
    typeof value.email !== "string" ||
    !(value.emailVerifiedAt === null ||
      typeof value.emailVerifiedAt === "string") ||
    typeof value.active !== "boolean" ||
    !Number.isInteger(value.sessionVersion) ||
    value.sessionVersion < 0
  ) {
    return null;
  }
  return {
    documentId: value.documentId,
    name: value.name,
    email: value.email,
    emailVerifiedAt: value.emailVerifiedAt,
    active: value.active,
    sessionVersion: value.sessionVersion,
  };
}

function browserSafeOperationBody(operation, value) {
  const customer = safeCustomer(value);
  if (customer) return customer;
  if (
    operation === "forgot-password" &&
    value &&
    typeof value === "object" &&
    value.accepted === true
  ) {
    return { accepted: true };
  }
  return null;
}

module.exports = { browserSafeOperationBody, safeCustomer };
