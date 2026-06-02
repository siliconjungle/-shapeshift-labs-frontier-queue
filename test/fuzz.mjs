import assert from 'node:assert';
import {
  cancelQueueJob,
  completeQueueJob,
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

const args = parseArgs(process.argv.slice(2));
const cases = readPositiveInt(args.cases, 500);
let seed = readPositiveInt(args.seed, 0x71e5d15c);

let checked = 0;
for (let scenarioIndex = 0; scenarioIndex < cases; scenarioIndex++) {
  let now = 1;
  let state = createQueueState({
    id: 'fuzz.queue.' + scenarioIndex,
    defaults: {
      leaseMs: 10 + nextInt(40),
      maxStalls: 1 + nextInt(2),
      retry: {
        maxAttempts: 2 + nextInt(4),
        initialDelayMs: 1 + nextInt(10),
        maxDelayMs: 20 + nextInt(80),
        backoff: 1 + nextInt(3),
        jitter: pick(['none', 'full', 'equal'])
      }
    },
    metadata: { seed }
  });

  for (let step = 0; step < 24; step++) {
    now += 1 + nextInt(5);
    const before = state;
    const op = nextInt(8);
    let mutation;

    if (op <= 2 || state.jobs.length === 0) {
      mutation = enqueueQueueJob(state, makeJobInput(scenarioIndex, step), { now });
    } else if (op === 3) {
      mutation = leaseQueueJobs(state, {
        queue: maybe() ? pick(['default', 'media', 'reports']) : undefined,
        workerId: 'worker-' + nextInt(4),
        count: 1 + nextInt(3),
        now
      });
    } else if (op === 4 && leasedJobs(state).length) {
      const job = pick(leasedJobs(state));
      mutation = maybe()
        ? completeQueueJob(state, { jobId: job.id, leaseToken: job.lease.token, workerId: job.lease.owner, now })
        : failQueueJob(state, {
            jobId: job.id,
            leaseToken: job.lease.token,
            workerId: job.lease.owner,
            now,
            error: { type: maybe() ? 'Transient' : 'Permanent', message: 'fuzz', retryable: maybe() },
            reason: 'fuzz'
          });
    } else if (op === 5 && state.jobs.some((job) => job.status === 'leased')) {
      const latestExpiry = Math.max(...state.jobs.filter((job) => job.lease).map((job) => job.lease.expiresAt));
      mutation = expireQueueLeases(state, { now: latestExpiry + 1, reason: 'fuzz-expire' });
    } else if (op === 6 && retryableDeadLetters(state).length) {
      mutation = retryQueueDeadLetter(state, {
        deadLetterId: pick(retryableDeadLetters(state)).id,
        now,
        queue: maybe() ? pick(['default', 'media', 'reports']) : undefined,
        reason: 'fuzz-retry'
      });
    } else {
      const cancellable = state.jobs.filter((job) => job.status === 'queued' || job.status === 'retrying' || job.status === 'leased');
      mutation = cancellable.length
        ? cancelQueueJob(state, { jobId: pick(cancellable).id, now, reason: 'fuzz-cancel' })
        : leaseQueueJobs(state, { workerId: 'worker-' + nextInt(4), count: 1, now });
    }

    assert.strictEqual(verifyQueuePatch(before, mutation.patch, mutation.state), true, mutation.outcome);
    assert.strictEqual(mutation.evidence.replayVerified, true, mutation.outcome);
    state = mutation.state;
    assertInvariants(state, now);
    checked++;
  }
}

console.log('frontier-queue fuzz ok: ' + checked + ' mutations');

function makeJobInput(scenarioIndex, step) {
  const dedupe = maybe();
  const id = 'job-' + scenarioIndex + '-' + step + '-' + nextInt(100000);
  return {
    id,
    queue: pick(['default', 'media', 'reports']),
    payload: { scenarioIndex, step, value: nextInt(1000) },
    patch: [[0, ['jobs', id, 'status'], 'queued']],
    dedupeKey: dedupe ? 'dedupe-' + (scenarioIndex % 11) + '-' + nextInt(7) : undefined,
    dedupeMode: dedupe ? pick(['drop', 'replace', 'preserve-run-at', 'merge-payload']) : undefined,
    priority: nextInt(10),
    groupKey: maybe() ? 'group-' + nextInt(5) : undefined,
    delayMs: maybe() ? nextInt(12) : 0,
    retry: maybe() ? {
      maxAttempts: 2 + nextInt(3),
      initialDelayMs: 1 + nextInt(5),
      maxDelayMs: 10 + nextInt(40),
      backoff: 1 + nextInt(3),
      jitter: pick(['none', 'full', 'equal'])
    } : undefined,
    leaseMs: 5 + nextInt(50),
    maxStalls: nextInt(3),
    tags: ['fuzz', step % 2 === 0 ? 'even' : 'odd']
  };
}

function assertInvariants(state, now) {
  const ids = new Set();
  const leasedGroups = new Set();
  for (const job of state.jobs) {
    assert.ok(!ids.has(job.id), 'duplicate job id ' + job.id);
    ids.add(job.id);
    if (job.status === 'leased' && job.groupKey) {
      const key = job.queue + '\0' + job.groupKey;
      assert.ok(!leasedGroups.has(key), 'duplicate leased group ' + key);
      leasedGroups.add(key);
      assert.ok(job.lease);
      assert.ok(job.lease.expiresAt >= job.lease.leasedAt);
    }
    assert.ok(job.deliveryCount >= 0);
    assert.ok(job.acquiredCount >= 0);
    assert.ok(job.stalledCount >= 0);
  }
  for (const dead of state.deadLetters) {
    assert.ok(ids.has(dead.jobId), 'dead-letter references missing job');
    assert.ok(dead.attempts >= 0);
  }
  const inspection = inspectQueueState(state, { now });
  assert.strictEqual(inspection.total, state.jobs.length);
  assert.ok(inspection.ready <= inspection.queued + inspection.retrying);
  const jsonl = encodeQueueJsonl(state.events.slice(-3));
  assert.strictEqual(decodeQueueJsonl(jsonl).length, Math.min(3, state.events.length));
}

function leasedJobs(state) {
  return state.jobs.filter((job) => job.status === 'leased' && job.lease);
}

function retryableDeadLetters(state) {
  return state.deadLetters.filter((dead) => dead.retriedAt === undefined);
}

function pick(values) {
  return values[nextInt(values.length)];
}

function maybe() {
  return (next() & 1) === 1;
}

function nextInt(max) {
  return next() % max;
}

function next() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cases') out.cases = argv[++i];
    else if (argv[i] === '--seed') out.seed = argv[++i];
  }
  return out;
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
