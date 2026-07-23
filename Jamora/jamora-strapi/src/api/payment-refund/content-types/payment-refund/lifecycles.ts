const immutable = () => { throw new Error("Payment refund records are append-only."); };
export default { beforeUpdate: immutable, beforeUpdateMany: immutable, beforeDelete: immutable, beforeDeleteMany: immutable };
