"use strict";

const immutable = () => { throw new Error("Payment event records are append-only."); };
const noBatchCreate = () => { throw new Error("Payment events must be created one at a time."); };

module.exports = {
  beforeCreateMany: noBatchCreate,
  beforeUpdate: immutable,
  beforeUpdateMany: immutable,
  beforeDelete: immutable,
  beforeDeleteMany: immutable,
};
