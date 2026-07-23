"use strict";

class BoundedWorkOverloadError extends Error {
  constructor() {
    super("Password work capacity exceeded.");
    this.code = "password_work_overloaded";
  }
}

function createBoundedWork(maxConcurrent, maxQueued = 32) {
  const limit = Number.isSafeInteger(maxConcurrent) && maxConcurrent > 0
    ? maxConcurrent
    : 4;
  let active = 0;
  const queue = [];

  const startNext = () => {
    while (active < limit && queue.length) {
      const { work, resolve, reject } = queue.shift();
      active += 1;
      Promise.resolve()
        .then(work)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          startNext();
        });
    }
  };

  return (work) => new Promise((resolve, reject) => {
    if (queue.length >= maxQueued) {
      reject(new BoundedWorkOverloadError());
      return;
    }
    queue.push({ work, resolve, reject });
    startNext();
  });
}

module.exports = { BoundedWorkOverloadError, createBoundedWork };
