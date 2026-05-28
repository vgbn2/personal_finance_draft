const jobs = [];

function enqueue(job) {
  jobs.push({
    ...job,
    enqueued_at: new Date().toISOString(),
  });
  return jobs[jobs.length - 1];
}

function list() {
  return jobs.slice();
}

function clear() {
  jobs.length = 0;
}

module.exports = {
  clear,
  enqueue,
  list,
};
