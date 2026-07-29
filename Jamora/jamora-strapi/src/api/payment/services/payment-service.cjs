"use strict";

function denied() {
  throw new Error("Not found.");
}

module.exports = {
  find: denied,
  findOne: denied,
  create: denied,
  update: denied,
  delete: denied,
};
