import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  calculateRetryDelayMs,
  completeQueueJob,
  createQueueEvidence,
  createQueueState,
  decodeQueueJsonl,
  encodeQueueJsonl,
  enqueueQueueJob,
  expireQueueLeases,
  failQueueJob,
  inspectQueueState,
  leaseQueueJobs
} from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, '..');
const repoRoot = path.basename(path.dirname(packageDir)) === 'packages'
  ? path.resolve(packageDir, '..', '..')
  : packageDir;
const args = parseArgs(process.argv.slice(2));
const jobCount = readPositiveInt(args.jobs, 500);
const rounds = readPositiveInt(args.rounds, 30);
const outPath = args.out ? path.resolve(repoRoot, args.out) : null;

const base = makeQueue(jobCount);
const dedupeState = enqueueQueueJob(createQueueState(), {
  id: 'dedupe-base',
  dedupeKey: 'same',
  dedupeMode: 'drop',
  payload: { value: 1 }
}, { now: 1 }).state;
const leasedOne = leaseQueueJobs(enqueueQueueJob(createQueueState({
  defaults: { retry: { maxAttempts: 3, initialDelayMs: 5, maxDelayMs: 50, jitter: 'none' } }
}), {
  id: 'leased-one',
  payload: { value: 1 }
}, { now: 1 }).state, { workerId: 'bench', count: 1, now: 2 }).state;
const leasedJob = leasedOne.jobs[0];
const expiring = leaseQueueJobs(enqueueQueueJob(createQueueState({ defaults: { leaseMs: 5, maxStalls: 1 } }), {
  id: 'expiring-one'
}, { now: 1 }).state, { workerId: 'bench', count: 1, now: 2 }).state;
let jsonl = encodeQueueJsonl(base.events.slice(0, 32));
let cursor = 0;

const rows = [
  measure('enqueue-job-' + jobCount, 8, () => {
    const mutation = enqueueQueueJob(base, makeJob('new-' + cursor++, cursor), { now: cursor });
    return mutation.state.jobs.length + mutation.patch.length;
  }),
  measure('dedupe-drop', 32, () => {
    const mutation = enqueueQueueJob(dedupeState, {
      dedupeKey: 'same',
      dedupeMode: 'drop',
      payload: { value: cursor++ }
    }, { now: cursor });
    return mutation.patch.length;
  }),
  measure('dedupe-replace', 32, () => {
    const mutation = enqueueQueueJob(dedupeState, {
      dedupeKey: 'same',
      dedupeMode: 'replace',
      payload: { value: cursor++ }
    }, { now: cursor });
    return mutation.state.jobs[0].payload.value;
  }),
  measure('lease-priority-' + jobCount, 8, () => {
    const mutation = leaseQueueJobs(base, { workerId: 'bench-' + cursor++, count: 8, now: 1000 });
    return mutation.jobs.length + mutation.patch.length;
  }),
  measure('complete-leased', 32, () => {
    const mutation = completeQueueJob(leasedOne, {
      jobId: leasedJob.id,
      leaseToken: leasedJob.lease.token,
      workerId: 'bench',
      now: 10 + cursor++
    });
    return mutation.patch.length;
  }),
  measure('fail-retry', 32, () => {
    const mutation = failQueueJob(leasedOne, {
      jobId: leasedJob.id,
      leaseToken: leasedJob.lease.token,
      workerId: 'bench',
      now: 10 + cursor++,
      error: { type: 'Transient', message: 'retry', retryable: true }
    });
    return mutation.job.availableAt;
  }),
  measure('expire-lease', 32, () => {
    const mutation = expireQueueLeases(expiring, { now: 100 + cursor++, reason: 'bench' });
    return mutation.jobs.length;
  }),
  measure('inspect-' + jobCount, 32, () => inspectQueueState(base, { now: 1000 }).ready),
  measure('evidence-hash-' + jobCount, 8, () => createQueueEvidence(base).afterHash.length),
  measure('retry-delay', 128, () => calculateRetryDelayMs({ initialDelayMs: 5, maxDelayMs: 500, backoff: 2, jitter: 'full' }, 3, 'bench-' + cursor++)),
  measure('jsonl-encode', 32, () => {
    jsonl = encodeQueueJsonl(base.events.slice(0, 32));
    return jsonl.length;
  }),
  measure('jsonl-decode', 32, () => decodeQueueJsonl(jsonl).length)
];

const report = {
  package: '@shapeshift-labs/frontier-queue',
  version: readPackageVersion(),
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform + ' ' + process.arch,
  jobCount,
  rounds,
  rows
};

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
}

console.log(report.package + ' package benchmark');
console.log('Node ' + report.node + ' on ' + report.platform + ', jobs=' + jobCount + ', rounds=' + rounds);
console.log('These are Frontier-only package measurements, not competitor comparisons.');
console.log('');
console.log(padRight('Fixture', 30) + padLeft('Median', 12) + padLeft('p95', 12));
for (const row of rows) {
  console.log(padRight(row.fixture, 30) + padLeft(formatUs(row.medianUs), 12) + padLeft(formatUs(row.p95Us), 12));
}
if (outPath) console.log('\nwrote ' + path.relative(repoRoot, outPath));

function makeQueue(count) {
  let state = createQueueState({
    id: 'bench.queue',
    defaults: {
      leaseMs: 30000,
      retry: { maxAttempts: 3, initialDelayMs: 5, maxDelayMs: 500, backoff: 2, jitter: 'full' }
    }
  });
  for (let i = 0; i < count; i++) {
    state = enqueueQueueJob(state, makeJob('job-' + i, i), { now: i }).state;
  }
  return state;
}

function makeJob(id, index) {
  return {
    id,
    queue: index % 3 === 0 ? 'media' : index % 3 === 1 ? 'reports' : 'default',
    payload: { id, index, value: index % 17 },
    patch: [[0, ['jobs', id, 'status'], 'queued']],
    dedupeKey: index % 5 === 0 ? 'asset:' + (index % 100) : undefined,
    dedupeMode: index % 5 === 0 ? (index % 10 === 0 ? 'replace' : 'drop') : undefined,
    priority: index % 11,
    groupKey: index % 7 === 0 ? 'group:' + (index % 13) : undefined,
    delayMs: index % 19 === 0 ? 25 : 0,
    tags: ['bench', index % 2 === 0 ? 'even' : 'odd']
  };
}

function measure(fixture, batchSize, fn) {
  const values = [];
  let sink = 0;
  for (let round = 0; round < rounds; round++) {
    const started = performance.now();
    for (let i = 0; i < batchSize; i++) sink += fn();
    values[values.length] = ((performance.now() - started) * 1000) / batchSize;
  }
  if (sink === -1) console.log('sink=' + sink);
  values.sort((left, right) => left - right);
  return { fixture, medianUs: percentile(values, 0.5), p95Us: percentile(values, 0.95) };
}

function percentile(values, p) {
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * p))] ?? 0;
}

function formatUs(value) {
  if (value >= 1000) return (value / 1000).toFixed(2) + ' ms';
  return value.toFixed(2) + ' us';
}

function padRight(value, width) {
  return String(value).padEnd(width, ' ');
}

function padLeft(value, width) {
  return String(value).padStart(width, ' ');
}

function readPackageVersion() {
  return JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).version;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--jobs') out.jobs = argv[++i];
    else if (arg === '--rounds') out.rounds = argv[++i];
    else if (arg === '--out') out.out = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run bench -- [--jobs 500] [--rounds 30] [--out benchmarks/results/frontier-queue-package-bench-latest.json]');
      process.exit(0);
    }
  }
  return out;
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
