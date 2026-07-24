const immutable = () => {
  throw new Error("Membership credit entries are append-only.");
};

export default {
  beforeUpdate: immutable,
  beforeUpdateMany: immutable,
  beforeDelete: immutable,
  beforeDeleteMany: immutable,
};
