import { validateLedgerEntry } from "./ledger-entry-validation.cjs";

const immutable = () => {
  throw new Error("Membership credit entries are append-only.");
};

export default {
  beforeCreate(event: any) {
    validateLedgerEntry(event.params.data);
  },
  beforeUpdate: immutable,
  beforeUpdateMany: immutable,
  beforeDelete: immutable,
  beforeDeleteMany: immutable,
};
