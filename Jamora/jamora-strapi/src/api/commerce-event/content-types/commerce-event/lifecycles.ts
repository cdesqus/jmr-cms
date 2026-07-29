const immutable = () => { throw new Error("Commerce events are append-only."); };
export default { beforeUpdate: immutable, beforeUpdateMany: immutable, beforeDelete: immutable, beforeDeleteMany: immutable };
