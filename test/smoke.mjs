import assert from 'node:assert';
import { applyPatchImmutable } from '@shapeshift-labs/frontier';
import {
  calculateRetryDelayMs,
  cancelQueueJob,
  completeQueueJob,
  createQueueEvidence,
  createQueueState,
  decodeQueueJsonl,
  encodeQueueJsonl,
  enqueueQueueJob,
  expireQueueLeases,
  failQueueJob,
  inspectQueueState,
  leaseQueueJobs,
  retryQueueDeadLetter,
  verifyQueuePatch
} from '../dist/index.js';

let state = createQueueState({
  id: 'smoke.queue',
  defaults: {
    leaseMs: 50,
    maxStalls: 1,
    retry: { maxAttempts: 2, initialDelayMs: 25, maxDelayMs: 100, backoff: 2, jitter: 'none' }
  }
});

let mutation = enqueueQueueJob(state, {
  id: 'dedupe-a',
  payload: { version: 1 },
  patch: [[0, ['entities', 'dedupe-a', 'status'], 'queued']],
  dedupeKey: 'asset:a',
  dedupeMode: 'drop'
}, { now: 1 });
assertReplay(state, mutation);
state = mutation.state;
assert.strictEqual(mutation.job.patch.length, 1);

mutation = enqueueQueueJob(state, {
  payload: { version: 99 },
  dedupeKey: 'asset:a',
  dedupeMode: 'drop'
}, { now: 2 });
assertReplay(state, mutation);
assert.strictEqual(mutation.outcome, 'deduped');
assert.strictEqual(mutation.state.jobs.length, 1);
state = mutation.state;

mutation = enqueueQueueJob(state, {
  payload: { version: 2 },
  dedupeKey: 'asset:a',
  dedupeMode: 'replace'
}, { now: 3 });
assertReplay(state, mutation);
assert.strictEqual(mutation.outcome, 'replaced');
assert.deepStrictEqual(mutation.job.payload, { version: 2 });
state = mutation.state;

let groupState = createQueueState({
  id: 'group.queue',
  defaults: {
    leaseMs: 50,
    maxStalls: 1,
    retry: { maxAttempts: 2, initialDelayMs: 25, maxDelayMs: 100, backoff: 2, jitter: 'none' }
  }
});
groupState = enqueueQueueJob(groupState, { id: 'alpha-low', groupKey: 'alpha', priority: 1 }, { now: 10 }).state;
groupState = enqueueQueueJob(groupState, { id: 'alpha-high', groupKey: 'alpha', priority: 2 }, { now: 11 }).state;
groupState = enqueueQueueJob(groupState, { id: 'solo', priority: 3 }, { now: 12 }).state;
groupState = enqueueQueueJob(groupState, { id: 'delayed', priority: 100, delayMs: 1000 }, { now: 12 }).state;

mutation = leaseQueueJobs(groupState, { workerId: 'worker-1', count: 4, now: 20 });
assertReplay(groupState, mutation);
assert.strictEqual(mutation.outcome, 'leased');
assert.deepStrictEqual(mutation.jobs.map((job) => job.id), ['solo', 'alpha-high']);
assert.strictEqual(mutation.jobs.filter((job) => job.groupKey === 'alpha').length, 1);
groupState = mutation.state;

const solo = mutation.jobs.find((job) => job.id === 'solo');
mutation = completeQueueJob(groupState, {
  jobId: solo.id,
  leaseToken: solo.lease.token,
  workerId: 'worker-1',
  now: 25,
  metadata: { result: 'ok' }
});
assertReplay(groupState, mutation);
assert.strictEqual(mutation.job.status, 'completed');
groupState = mutation.state;

const alpha = groupState.jobs.find((job) => job.id === 'alpha-high');
mutation = failQueueJob(groupState, {
  jobId: alpha.id,
  leaseToken: alpha.lease.token,
  workerId: 'worker-1',
  now: 30,
  error: { type: 'Transient', message: 'try again', retryable: true }
});
assertReplay(groupState, mutation);
assert.strictEqual(mutation.outcome, 'retrying');
assert.strictEqual(mutation.job.availableAt, 55);
groupState = mutation.state;

mutation = leaseQueueJobs(groupState, { workerId: 'worker-2', count: 1, now: 54 });
assertReplay(groupState, mutation);
assert.strictEqual(mutation.jobs.length, 1);
assert.strictEqual(mutation.jobs[0].id, 'alpha-low');
groupState = mutation.state;

mutation = leaseQueueJobs(groupState, { workerId: 'worker-3', count: 1, now: 55 });
assertReplay(groupState, mutation);
assert.strictEqual(mutation.jobs.length, 0);
groupState = mutation.state;

const alphaLow = groupState.jobs.find((job) => job.id === 'alpha-low');
mutation = completeQueueJob(groupState, {
  jobId: alphaLow.id,
  leaseToken: alphaLow.lease.token,
  workerId: 'worker-2',
  now: 56
});
assertReplay(groupState, mutation);
groupState = mutation.state;

mutation = leaseQueueJobs(groupState, { workerId: 'worker-3', count: 1, now: 57 });
assertReplay(groupState, mutation);
assert.strictEqual(mutation.jobs[0].id, 'alpha-high');
groupState = mutation.state;

const retriedAlpha = mutation.jobs[0];
mutation = failQueueJob(groupState, {
  jobId: retriedAlpha.id,
  leaseToken: retriedAlpha.lease.token,
  workerId: 'worker-3',
  now: 60,
  error: { type: 'Permanent', message: 'done', retryable: true }
});
assertReplay(groupState, mutation);
assert.strictEqual(mutation.outcome, 'dead-lettered');
assert.strictEqual(mutation.deadLetter.jobId, 'alpha-high');
groupState = mutation.state;

mutation = retryQueueDeadLetter(groupState, { deadLetterId: mutation.deadLetter.id, now: 70, reason: 'operator' });
assertReplay(groupState, mutation);
assert.strictEqual(mutation.job.status, 'queued');
groupState = mutation.state;

let stallState = createQueueState({
  id: 'stall.queue',
  defaults: {
    leaseMs: 10,
    maxStalls: 1,
    retry: { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 20, jitter: 'none' }
  }
});
stallState = enqueueQueueJob(stallState, { id: 'stalling' }, { now: 1 }).state;
mutation = leaseQueueJobs(stallState, { workerId: 'stall-worker', count: 1, now: 2 });
stallState = mutation.state;
mutation = expireQueueLeases(stallState, { now: 13, reason: 'timeout' });
assertReplay(stallState, mutation);
assert.strictEqual(mutation.job.status, 'retrying');
stallState = mutation.state;
mutation = leaseQueueJobs(stallState, { workerId: 'stall-worker', count: 1, now: 14 });
stallState = mutation.state;
mutation = expireQueueLeases(stallState, { now: 25, reason: 'timeout' });
assertReplay(stallState, mutation);
assert.strictEqual(mutation.job.status, 'dead');
assert.strictEqual(mutation.state.deadLetters.length, 1);
stallState = mutation.state;

mutation = cancelQueueJob(stallState, { jobId: 'stalling', now: 26, reason: 'manual' });
assertReplay(stallState, mutation);
assert.strictEqual(mutation.job.status, 'cancelled');

const inspection = inspectQueueState(groupState, { now: 80 });
assert.strictEqual(inspection.completed, 2);
assert.strictEqual(inspection.dead, 0);
assert.ok(inspection.ready >= 1);

const evidence = createQueueEvidence(groupState, [], 'snapshot');
assert.strictEqual(evidence.replayVerified, true);
assert.ok(evidence.afterHash);

const jsonl = encodeQueueJsonl([groupState.events[0], groupState.deadLetters[0] ?? { ok: true }]);
assert.strictEqual(decodeQueueJsonl(jsonl).length, 2);
assert.strictEqual(calculateRetryDelayMs({ initialDelayMs: 10, maxDelayMs: 100, backoff: 2, jitter: 'none' }, 3), 40);

function assertReplay(before, mutation) {
  assert.strictEqual(mutation.evidence.replayVerified, true, mutation.outcome);
  assert.strictEqual(verifyQueuePatch(before, mutation.patch, mutation.state), true, mutation.outcome);
  assert.deepStrictEqual(applyPatchImmutable(before, mutation.patch), mutation.state, mutation.outcome);
}
