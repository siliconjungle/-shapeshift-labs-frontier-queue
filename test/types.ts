import {
  completeQueueJob,
  createQueueState,
  enqueueQueueJob,
  inspectQueueState,
  leaseQueueJobs,
  type FrontierQueueEvidence,
  type FrontierQueueJob,
  type FrontierQueueMutation,
  type FrontierQueueState
} from '../dist/index.js';

let state: FrontierQueueState = createQueueState({
  id: 'typed.queue'
});

const enqueued: FrontierQueueMutation = enqueueQueueJob(state, {
  queue: 'typed',
  payload: { id: 'asset-1' },
  patch: [[0, ['assets', '1', 'status'], 'queued']],
  dedupeKey: 'asset-1',
  priority: 1
}, { now: 1 });
state = enqueued.state;

const leased = leaseQueueJobs(state, { queue: 'typed', workerId: 'worker-1', count: 1, now: 2 });
const job: FrontierQueueJob | undefined = leased.jobs?.[0];
const evidence: FrontierQueueEvidence = leased.evidence;

if (job) {
  state = completeQueueJob(leased.state, {
    jobId: job.id,
    leaseToken: job.lease?.token,
    workerId: 'worker-1',
    now: 3
  }).state;
}

inspectQueueState(state).queues satisfies Record<string, { ready: number }>;
evidence.replayVerified satisfies boolean;
enqueued.patch satisfies unknown[];
