function appendOnly() {
  throw new Error("Shipment events are append-only.");
}

export default {
  beforeUpdate: appendOnly,
  beforeUpdateMany: appendOnly,
  beforeDelete: appendOnly,
  beforeDeleteMany: appendOnly,
};
