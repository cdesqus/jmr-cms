const immutable = () => { throw new Error("Customer consent decisions are append-only."); };
export default { beforeUpdate: immutable, beforeUpdateMany: immutable, beforeDelete: immutable, beforeDeleteMany: immutable };
