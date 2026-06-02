import {
  OP_APPEND,
  OP_SET,
  applyPatchImmutable,
  cloneJson,
  equalsJson,
  type JsonObject,
  type JsonValue,
  type Patch
} from '@shapeshift-labs/frontier';

export const FRONTIER_QUEUE_STATE_KIND = 'frontier.queue.state';
export const FRONTIER_QUEUE_STATE_VERSION = 1;
export const FRONTIER_QUEUE_JOB_KIND = 'frontier.queue.job';
export const FRONTIER_QUEUE_JOB_VERSION = 1;
export const FRONTIER_QUEUE_EVENT_KIND = 'frontier.queue.event';
export const FRONTIER_QUEUE_EVENT_VERSION = 1;
export const FRONTIER_QUEUE_DEAD_LETTER_KIND = 'frontier.queue.dead-letter';
export const FRONTIER_QUEUE_DEAD_LETTER_VERSION = 1;
export const FRONTIER_QUEUE_EVIDENCE_KIND = 'frontier.queue.evidence';
export const FRONTIER_QUEUE_EVIDENCE_VERSION = 1;

export type FrontierQueueJobStatus =
  | 'queued'
  | 'retrying'
  | 'leased'
  | 'completed'
  | 'failed'
  | 'dead'
  | 'cancelled'
  | 'deduped';
export type FrontierQueueDedupeMode =
  | 'none'
  | 'drop'
  | 'replace'
  | 'preserve-run-at'
  | 'unsafe-dedupe'
  | 'merge-payload';
export type FrontierQueueJitterMode = 'none' | 'full' | 'equal';

export interface FrontierQueueRetryPolicyInput {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoff?: number;
  jitter?: FrontierQueueJitterMode;
  retryOn?: readonly string[];
  nonRetryable?: readonly string[];
}

export interface FrontierQueueRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoff: number;
  jitter: FrontierQueueJitterMode;
  retryOn: string[];
  nonRetryable: string[];
}

export interface FrontierQueueDefaultsInput {
  queue?: string;
  leaseMs?: number;
  maxStalls?: number;
  retry?: FrontierQueueRetryPolicyInput;
  deadLetterQueue?: string;
}

export interface FrontierQueueDefaults {
  queue: string;
  leaseMs: number;
  maxStalls: number;
  retry: FrontierQueueRetryPolicy;
  deadLetterQueue: string;
}

export interface FrontierQueueStateInput {
  id?: string;
  defaults?: FrontierQueueDefaultsInput;
  jobs?: readonly FrontierQueueJob[];
  deadLetters?: readonly FrontierQueueDeadLetter[];
  events?: readonly FrontierQueueEvent[];
  sequence?: number;
  metadata?: JsonObject;
}

export interface FrontierQueueState {
  kind: typeof FRONTIER_QUEUE_STATE_KIND;
  version: typeof FRONTIER_QUEUE_STATE_VERSION;
  id: string;
  defaults: FrontierQueueDefaults;
  jobs: FrontierQueueJob[];
  deadLetters: FrontierQueueDeadLetter[];
  events: FrontierQueueEvent[];
  sequence: number;
  metadata?: JsonObject;
}

export interface FrontierQueueJobInput {
  id?: string;
  queue?: string;
  payload?: JsonValue;
  patch?: Patch;
  dedupeKey?: string;
  dedupeMode?: FrontierQueueDedupeMode;
  priority?: number;
  groupKey?: string;
  runAt?: number | string;
  delayMs?: number;
  retry?: FrontierQueueRetryPolicyInput;
  maxAttempts?: number;
  leaseMs?: number;
  maxStalls?: number;
  tags?: readonly string[];
  metadata?: JsonObject;
}

export interface FrontierQueueJob {
  kind: typeof FRONTIER_QUEUE_JOB_KIND;
  version: typeof FRONTIER_QUEUE_JOB_VERSION;
  id: string;
  queue: string;
  status: FrontierQueueJobStatus;
  payload?: JsonValue;
  patch?: Patch;
  dedupeKey?: string;
  dedupeMode: FrontierQueueDedupeMode;
  priority: number;
  groupKey?: string;
  runAt: number;
  availableAt: number;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  acquiredCount: number;
  deliveryCount: number;
  stalledCount: number;
  maxAttempts: number;
  maxStalls: number;
  retry: FrontierQueueRetryPolicy;
  leaseMs: number;
  lease?: FrontierQueueLease;
  completedAt?: number;
  failedAt?: number;
  deadAt?: number;
  error?: FrontierQueueError;
  tags: string[];
  metadata?: JsonObject;
}

export interface FrontierQueueLease {
  token: string;
  owner: string;
  leasedAt: number;
  expiresAt: number;
}

export interface FrontierQueueError {
  type: string;
  message: string;
  retryable: boolean;
  metadata?: JsonObject;
}

export interface FrontierQueueEvent {
  kind: typeof FRONTIER_QUEUE_EVENT_KIND;
  version: typeof FRONTIER_QUEUE_EVENT_VERSION;
  id: string;
  type: string;
  jobId?: string;
  queue?: string;
  at: number;
  reason?: string;
  workerId?: string;
  leaseToken?: string;
  beforeHash?: string;
  metadata?: JsonObject;
}

export interface FrontierQueueDeadLetter {
  kind: typeof FRONTIER_QUEUE_DEAD_LETTER_KIND;
  version: typeof FRONTIER_QUEUE_DEAD_LETTER_VERSION;
  id: string;
  jobId: string;
  queue: string;
  deadLetterQueue: string;
  failedAt: number;
  attempts: number;
  deliveryCount: number;
  reason: string;
  error?: FrontierQueueError;
  job: FrontierQueueJob;
  retriedAt?: number;
  metadata?: JsonObject;
}

export interface FrontierQueueMutation {
  state: FrontierQueueState;
  patch: Patch;
  events: FrontierQueueEvent[];
  outcome: string;
  job?: FrontierQueueJob;
  jobs?: FrontierQueueJob[];
  deadLetter?: FrontierQueueDeadLetter;
  evidence: FrontierQueueEvidence;
}

export interface FrontierQueueEvidence {
  kind: typeof FRONTIER_QUEUE_EVIDENCE_KIND;
  version: typeof FRONTIER_QUEUE_EVIDENCE_VERSION;
  queueId: string;
  outcome: string;
  beforeHash: string;
  afterHash: string;
  patchOperations: number;
  eventCount: number;
  readyCount: number;
  leasedCount: number;
  deadCount: number;
  replayVerified: boolean;
}

export interface FrontierQueueLeaseInput {
  queue?: string;
  workerId: string;
  now?: number;
  count?: number;
  leaseMs?: number;
}

export interface FrontierQueueCompleteInput {
  jobId: string;
  workerId?: string;
  leaseToken?: string;
  now?: number;
  metadata?: JsonObject;
}

export interface FrontierQueueFailInput {
  jobId: string;
  workerId?: string;
  leaseToken?: string;
  now?: number;
  error?: string | Partial<FrontierQueueError>;
  retryable?: boolean;
  reason?: string;
  metadata?: JsonObject;
}

export interface FrontierQueueExpireInput {
  now?: number;
  queue?: string;
  reason?: string;
}

export interface FrontierQueueRetryDeadLetterInput {
  deadLetterId: string;
  now?: number;
  queue?: string;
  reason?: string;
}

export interface FrontierQueueCancelInput {
  jobId: string;
  now?: number;
  reason?: string;
}

export interface FrontierQueueInspection {
  queueId: string;
  now: number;
  total: number;
  queued: number;
  retrying: number;
  leased: number;
  completed: number;
  dead: number;
  cancelled: number;
  ready: number;
  oldestReadyAgeMs: number;
  queues: Record<string, FrontierQueueInspectionQueue>;
}

export interface FrontierQueueInspectionQueue {
  total: number;
  ready: number;
  leased: number;
  dead: number;
}

interface QueueIndexes {
  byId: Map<string, number>;
  dedupe: Map<string, number>;
}

const ACTIVE_DEDUPE_STATUSES = new Set<FrontierQueueJobStatus>(['queued', 'retrying', 'leased']);
const READY_STATUSES = new Set<FrontierQueueJobStatus>(['queued', 'retrying']);
const EMPTY_PATCH: Patch = [];

export function createQueueState(input: FrontierQueueStateInput = {}): FrontierQueueState {
  return {
    kind: FRONTIER_QUEUE_STATE_KIND,
    version: FRONTIER_QUEUE_STATE_VERSION,
    id: input.id || 'frontier.queue',
    defaults: normalizeDefaults(input.defaults),
    jobs: (input.jobs || []).map((job) => cloneJob(job)),
    deadLetters: (input.deadLetters || []).map((dead) => cloneDeadLetter(dead)),
    events: (input.events || []).map((event) => cloneEvent(event)),
    sequence: Math.max(0, Math.floor(input.sequence || 0)),
    metadata: cloneObject(input.metadata)
  };
}

export function enqueueQueueJob(state: FrontierQueueState, input: FrontierQueueJobInput, options: { now?: number } = {}): FrontierQueueMutation {
  const before = createQueueState(state);
  const next = cloneStateForMutation(before);
  const now = normalizeTime(options.now);
  const indexes = compileQueueIndexes(next);
  const dedupeMode = input.dedupeMode || (input.dedupeKey ? 'drop' : 'none');
  let outcome = 'enqueued';
  let job: FrontierQueueJob;
  const patch: Patch = [];

  if (input.dedupeKey && dedupeMode !== 'none') {
    const existingIndex = indexes.dedupe.get(dedupeScope(input.queue || next.defaults.queue, input.dedupeKey));
    if (existingIndex !== undefined) {
      const existing = next.jobs[existingIndex];
      if (dedupeMode === 'drop' || dedupeMode === 'unsafe-dedupe' || existing.status === 'leased') {
        outcome = 'deduped';
        job = existing;
        return appendOnlyEvent(before, next, createEvent(next, 'queue.job.deduped', now, {
          jobId: existing.id,
          queue: existing.queue,
          reason: dedupeMode,
          metadata: metadataWithDedupeKey(input.dedupeKey)
        }), outcome, job);
      }

      const replacement = normalizeJobInput(next, input, now, existing.id);
      replacement.createdAt = existing.createdAt;
      replacement.acquiredCount = existing.acquiredCount;
      replacement.deliveryCount = existing.deliveryCount;
      replacement.attempts = existing.attempts;
      replacement.stalledCount = existing.stalledCount;
      if (dedupeMode === 'preserve-run-at') {
        replacement.runAt = existing.runAt;
        replacement.availableAt = existing.availableAt;
      } else if (dedupeMode === 'merge-payload') {
        replacement.payload = mergePayload(existing.payload, replacement.payload);
      }
      next.jobs[existingIndex] = replacement;
      outcome = dedupeMode === 'merge-payload' ? 'merged' : 'replaced';
      job = replacement;
      patch[patch.length] = [OP_SET, ['jobs', existingIndex], patchValue(cloneJob(replacement))];
      const event = createEvent(next, 'queue.job.' + outcome, now, {
        jobId: replacement.id,
        queue: replacement.queue,
        reason: dedupeMode,
        metadata: metadataWithDedupeKey(input.dedupeKey)
      });
      next.events[next.events.length] = event;
      patch[patch.length] = [OP_APPEND, ['events'], patchValues([cloneEvent(event)])];
      return finishMutation(before, next, patch, [event], outcome, job);
    }
  }

  job = normalizeJobInput(next, input, now);
  next.jobs[next.jobs.length] = job;
  patch[patch.length] = [OP_APPEND, ['jobs'], patchValues([cloneJob(job)])];
  const event = createEvent(next, 'queue.job.enqueued', now, {
    jobId: job.id,
    queue: job.queue,
    metadata: metadataWithDedupeKey(job.dedupeKey)
  });
  next.events[next.events.length] = event;
  patch[patch.length] = [OP_APPEND, ['events'], patchValues([cloneEvent(event)])];
  return finishMutation(before, next, patch, [event], outcome, job);
}

export function leaseQueueJobs(state: FrontierQueueState, input: FrontierQueueLeaseInput): FrontierQueueMutation {
  const before = createQueueState(state);
  const next = cloneStateForMutation(before);
  const now = normalizeTime(input.now);
  const count = Math.max(1, Math.floor(input.count || 1));
  const patch: Patch = [];
  const events: FrontierQueueEvent[] = [];
  const leased: FrontierQueueJob[] = [];
  const lockedGroups = createLockedGroups(next);

  for (let i = 0; i < count; i++) {
    const index = findNextReadyJobIndex(next, now, input.queue, lockedGroups);
    if (index === -1) break;
    const current = next.jobs[index];
    const job = cloneJob(current);
    const leaseMs = Math.max(1, Math.floor(input.leaseMs || job.leaseMs || next.defaults.leaseMs));
    const token = createLeaseToken(next, job, input.workerId);
    job.status = 'leased';
    job.acquiredCount++;
    job.updatedAt = now;
    job.lease = {
      token,
      owner: input.workerId,
      leasedAt: now,
      expiresAt: now + leaseMs
    };
    next.jobs[index] = job;
    if (job.groupKey) lockedGroups.add(groupScope(job.queue, job.groupKey));
    patch[patch.length] = [OP_SET, ['jobs', index], patchValue(cloneJob(job))];
    leased[leased.length] = job;
    events[events.length] = createEvent(next, 'queue.job.leased', now, {
      jobId: job.id,
      queue: job.queue,
      workerId: input.workerId,
      leaseToken: token
    });
  }

  if (events.length) {
    for (const event of events) next.events[next.events.length] = event;
    patch[patch.length] = [OP_APPEND, ['events'], patchValues(events.map(cloneEvent))];
  }
  return finishMutation(before, next, patch, events, leased.length ? 'leased' : 'empty', leased[0], leased);
}

export function completeQueueJob(state: FrontierQueueState, input: FrontierQueueCompleteInput): FrontierQueueMutation {
  const before = createQueueState(state);
  const next = cloneStateForMutation(before);
  const now = normalizeTime(input.now);
  const index = requireJobIndex(next, input.jobId);
  const job = cloneJob(next.jobs[index]);
  assertLease(job, input.leaseToken);
  job.status = 'completed';
  job.completedAt = now;
  job.updatedAt = now;
  job.lease = undefined;
  job.metadata = mergeObjects(job.metadata, input.metadata);
  next.jobs[index] = job;
  const event = createEvent(next, 'queue.job.completed', now, {
    jobId: job.id,
    queue: job.queue,
    workerId: input.workerId,
    metadata: input.metadata
  });
  next.events[next.events.length] = event;
  return finishMutation(before, next, [
    [OP_SET, ['jobs', index], patchValue(cloneJob(job))],
    [OP_APPEND, ['events'], patchValues([cloneEvent(event)])]
  ], [event], 'completed', job);
}

export function failQueueJob(state: FrontierQueueState, input: FrontierQueueFailInput): FrontierQueueMutation {
  const before = createQueueState(state);
  const next = cloneStateForMutation(before);
  const now = normalizeTime(input.now);
  const index = requireJobIndex(next, input.jobId);
  const job = cloneJob(next.jobs[index]);
  assertLease(job, input.leaseToken);
  const error = normalizeError(input.error, input.retryable);
  const nextDeliveryCount = job.deliveryCount + 1;
  const retryable = shouldRetry(job, error, nextDeliveryCount);
  job.deliveryCount = nextDeliveryCount;
  job.attempts = nextDeliveryCount;
  job.error = error;
  job.failedAt = now;
  job.updatedAt = now;
  job.lease = undefined;

  const patch: Patch = [];
  let eventType = 'queue.job.failed';
  let outcome = 'failed';
  let deadLetter: FrontierQueueDeadLetter | undefined;
  if (retryable) {
    const delay = calculateRetryDelayMs(job.retry, nextDeliveryCount, job.id);
    job.status = 'retrying';
    job.availableAt = now + delay;
    job.runAt = job.availableAt;
    eventType = 'queue.job.retrying';
    outcome = 'retrying';
  } else {
    job.status = 'dead';
    job.deadAt = now;
    deadLetter = createDeadLetter(next, job, now, input.reason || error.type, error, input.metadata);
    next.deadLetters[next.deadLetters.length] = deadLetter;
    patch[patch.length] = [OP_APPEND, ['deadLetters'], patchValues([cloneDeadLetter(deadLetter)])];
    eventType = 'queue.job.dead-lettered';
    outcome = 'dead-lettered';
  }

  next.jobs[index] = job;
  patch.unshift([OP_SET, ['jobs', index], patchValue(cloneJob(job))]);
  const event = createEvent(next, eventType, now, {
    jobId: job.id,
    queue: job.queue,
    workerId: input.workerId,
    reason: input.reason || error.type,
    metadata: input.metadata
  });
  next.events[next.events.length] = event;
  patch[patch.length] = [OP_APPEND, ['events'], patchValues([cloneEvent(event)])];
  return finishMutation(before, next, patch, [event], outcome, job, undefined, deadLetter);
}

export function expireQueueLeases(state: FrontierQueueState, input: FrontierQueueExpireInput = {}): FrontierQueueMutation {
  const before = createQueueState(state);
  const next = cloneStateForMutation(before);
  const now = normalizeTime(input.now);
  const patch: Patch = [];
  const events: FrontierQueueEvent[] = [];
  const jobs: FrontierQueueJob[] = [];

  for (let index = 0; index < next.jobs.length; index++) {
    const current = next.jobs[index];
    if (current.status !== 'leased' || !current.lease || current.lease.expiresAt > now) continue;
    if (input.queue && current.queue !== input.queue) continue;
    const job = cloneJob(current);
    job.stalledCount++;
    job.updatedAt = now;
    job.lease = undefined;
    let eventType = 'queue.job.lease-expired';
    if (job.stalledCount > job.maxStalls) {
      const error = normalizeError({ type: 'LeaseExpired', message: input.reason || 'lease expired too many times', retryable: false }, false);
      job.status = 'dead';
      job.error = error;
      job.deadAt = now;
      const deadLetter = createDeadLetter(next, job, now, 'lease-expired', error);
      next.deadLetters[next.deadLetters.length] = deadLetter;
      patch[patch.length] = [OP_APPEND, ['deadLetters'], patchValues([cloneDeadLetter(deadLetter)])];
      eventType = 'queue.job.dead-lettered';
    } else {
      job.status = 'retrying';
      job.availableAt = now;
      job.runAt = Math.min(job.runAt, now);
    }
    next.jobs[index] = job;
    patch[patch.length] = [OP_SET, ['jobs', index], patchValue(cloneJob(job))];
    jobs[jobs.length] = job;
    events[events.length] = createEvent(next, eventType, now, {
      jobId: job.id,
      queue: job.queue,
      reason: input.reason || 'lease-expired'
    });
  }

  if (events.length) {
    for (const event of events) next.events[next.events.length] = event;
    patch[patch.length] = [OP_APPEND, ['events'], patchValues(events.map(cloneEvent))];
  }
  return finishMutation(before, next, patch, events, jobs.length ? 'leases-expired' : 'none-expired', jobs[0], jobs);
}

export function retryQueueDeadLetter(state: FrontierQueueState, input: FrontierQueueRetryDeadLetterInput): FrontierQueueMutation {
  const before = createQueueState(state);
  const next = cloneStateForMutation(before);
  const now = normalizeTime(input.now);
  const deadIndex = next.deadLetters.findIndex((dead) => dead.id === input.deadLetterId);
  if (deadIndex === -1) throw new RangeError('queue dead-letter not found: ' + input.deadLetterId);
  const dead = cloneDeadLetter(next.deadLetters[deadIndex]);
  const jobIndex = requireJobIndex(next, dead.jobId);
  const job = cloneJob(next.jobs[jobIndex]);
  job.status = 'queued';
  job.queue = input.queue || job.queue;
  job.availableAt = now;
  job.runAt = now;
  job.updatedAt = now;
  job.lease = undefined;
  dead.retriedAt = now;
  next.jobs[jobIndex] = job;
  next.deadLetters[deadIndex] = dead;
  const event = createEvent(next, 'queue.dead-letter.retried', now, {
    jobId: job.id,
    queue: job.queue,
    reason: input.reason || 'manual-retry'
  });
  next.events[next.events.length] = event;
  return finishMutation(before, next, [
    [OP_SET, ['jobs', jobIndex], patchValue(cloneJob(job))],
    [OP_SET, ['deadLetters', deadIndex], patchValue(cloneDeadLetter(dead))],
    [OP_APPEND, ['events'], patchValues([cloneEvent(event)])]
  ], [event], 'retried-dead-letter', job);
}

export function cancelQueueJob(state: FrontierQueueState, input: FrontierQueueCancelInput): FrontierQueueMutation {
  const before = createQueueState(state);
  const next = cloneStateForMutation(before);
  const now = normalizeTime(input.now);
  const index = requireJobIndex(next, input.jobId);
  const job = cloneJob(next.jobs[index]);
  job.status = 'cancelled';
  job.updatedAt = now;
  job.lease = undefined;
  next.jobs[index] = job;
  const event = createEvent(next, 'queue.job.cancelled', now, {
    jobId: job.id,
    queue: job.queue,
    reason: input.reason || 'cancelled'
  });
  next.events[next.events.length] = event;
  return finishMutation(before, next, [
    [OP_SET, ['jobs', index], patchValue(cloneJob(job))],
    [OP_APPEND, ['events'], patchValues([cloneEvent(event)])]
  ], [event], 'cancelled', job);
}

export function inspectQueueState(state: FrontierQueueState, input: { now?: number } = {}): FrontierQueueInspection {
  const now = normalizeTime(input.now);
  const queues: Record<string, FrontierQueueInspectionQueue> = {};
  const out: FrontierQueueInspection = {
    queueId: state.id,
    now,
    total: state.jobs.length,
    queued: 0,
    retrying: 0,
    leased: 0,
    completed: 0,
    dead: 0,
    cancelled: 0,
    ready: 0,
    oldestReadyAgeMs: 0,
    queues
  };
  let oldestReady = Infinity;
  for (const job of state.jobs) {
    const queue = queues[job.queue] || (queues[job.queue] = { total: 0, ready: 0, leased: 0, dead: 0 });
    queue.total++;
    if (job.status === 'queued') out.queued++;
    else if (job.status === 'retrying') out.retrying++;
    else if (job.status === 'leased') {
      out.leased++;
      queue.leased++;
    } else if (job.status === 'completed') out.completed++;
    else if (job.status === 'dead') {
      out.dead++;
      queue.dead++;
    } else if (job.status === 'cancelled') out.cancelled++;
    if (READY_STATUSES.has(job.status) && job.availableAt <= now) {
      out.ready++;
      queue.ready++;
      if (job.availableAt < oldestReady) oldestReady = job.availableAt;
    }
  }
  out.oldestReadyAgeMs = oldestReady === Infinity ? 0 : Math.max(0, now - oldestReady);
  return out;
}

export function createQueueEvidence(state: FrontierQueueState, patch: Patch = EMPTY_PATCH, outcome = 'snapshot'): FrontierQueueEvidence {
  const inspection = inspectQueueState(state);
  return {
    kind: FRONTIER_QUEUE_EVIDENCE_KIND,
    version: FRONTIER_QUEUE_EVIDENCE_VERSION,
    queueId: state.id,
    outcome,
    beforeHash: hashQueueValue(state),
    afterHash: hashQueueValue(state),
    patchOperations: patch.length,
    eventCount: state.events.length,
    readyCount: inspection.ready,
    leasedCount: inspection.leased,
    deadCount: inspection.dead,
    replayVerified: true
  };
}

export function verifyQueuePatch(before: FrontierQueueState, patch: Patch, after: FrontierQueueState): boolean {
  return equalsJson(applyPatchImmutable(before as unknown as JsonValue, patch) as JsonValue, after as unknown as JsonValue);
}

export function encodeQueueJsonl(records: readonly JsonObject[]): string {
  return records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : '');
}

export function decodeQueueJsonl(text: string): JsonObject[] {
  const records: JsonObject[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    records[records.length] = JSON.parse(line);
  }
  return records;
}

export function calculateRetryDelayMs(policyInput: FrontierQueueRetryPolicyInput | FrontierQueueRetryPolicy, attempt: number, seed = ''): number {
  const policy = normalizeRetryPolicy(policyInput);
  const exponent = Math.max(0, attempt - 1);
  const cap = Math.min(policy.maxDelayMs, Math.floor(policy.initialDelayMs * policy.backoff ** exponent));
  if (policy.jitter === 'none') return cap;
  const random = deterministicRandom(seed + ':' + attempt);
  if (policy.jitter === 'equal') return Math.floor(cap / 2 + random * (cap / 2));
  return Math.floor(random * cap);
}

export function hashQueueValue(value: unknown): string {
  const text = stableQueueStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function stableQueueStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map((item) => stableQueueStringify(item)).join(',') + ']';
  const object = value as Record<string, unknown>;
  return '{' + Object.keys(object).sort().map((key) => JSON.stringify(key) + ':' + stableQueueStringify(object[key])).join(',') + '}';
}

function appendOnlyEvent(before: FrontierQueueState, next: FrontierQueueState, event: FrontierQueueEvent, outcome: string, job?: FrontierQueueJob): FrontierQueueMutation {
  next.events[next.events.length] = event;
  return finishMutation(before, next, [[OP_APPEND, ['events'], patchValues([cloneEvent(event)])]], [event], outcome, job);
}

function finishMutation(
  before: FrontierQueueState,
  next: FrontierQueueState,
  patch: Patch,
  events: FrontierQueueEvent[],
  outcome: string,
  job?: FrontierQueueJob,
  jobs?: FrontierQueueJob[],
  deadLetter?: FrontierQueueDeadLetter
): FrontierQueueMutation {
  if (before.sequence !== next.sequence) {
    patch[patch.length] = [OP_SET, ['sequence'], next.sequence];
  }
  const replayVerified = verifyQueuePatch(before, patch, next);
  const inspection = inspectQueueState(next);
  return {
    state: next,
    patch,
    events,
    outcome,
    job,
    jobs,
    deadLetter,
    evidence: {
      kind: FRONTIER_QUEUE_EVIDENCE_KIND,
      version: FRONTIER_QUEUE_EVIDENCE_VERSION,
      queueId: next.id,
      outcome,
      beforeHash: hashQueueValue(before),
      afterHash: hashQueueValue(next),
      patchOperations: patch.length,
      eventCount: events.length,
      readyCount: inspection.ready,
      leasedCount: inspection.leased,
      deadCount: inspection.dead,
      replayVerified
    }
  };
}

function normalizeDefaults(input: FrontierQueueDefaultsInput = {}): FrontierQueueDefaults {
  return {
    queue: input.queue || 'default',
    leaseMs: Math.max(1, Math.floor(input.leaseMs || 30000)),
    maxStalls: Math.max(0, Math.floor(input.maxStalls ?? 1)),
    retry: normalizeRetryPolicy(input.retry),
    deadLetterQueue: input.deadLetterQueue || 'dead'
  };
}

function normalizeRetryPolicy(input: FrontierQueueRetryPolicyInput | FrontierQueueRetryPolicy = {}): FrontierQueueRetryPolicy {
  return {
    maxAttempts: Math.max(1, Math.floor(input.maxAttempts || 3)),
    initialDelayMs: Math.max(0, Math.floor(input.initialDelayMs ?? 1000)),
    maxDelayMs: Math.max(0, Math.floor(input.maxDelayMs ?? 60000)),
    backoff: Math.max(1, Number(input.backoff || 2)),
    jitter: input.jitter || 'full',
    retryOn: [...(input.retryOn || [])],
    nonRetryable: [...(input.nonRetryable || [])]
  };
}

function normalizeJobInput(state: FrontierQueueState, input: FrontierQueueJobInput, now: number, id?: string): FrontierQueueJob {
  const queue = input.queue || state.defaults.queue;
  const runAt = input.runAt !== undefined
    ? normalizeTime(input.runAt)
    : now + Math.max(0, Math.floor(input.delayMs || 0));
  const retry = normalizeRetryPolicy({
    ...state.defaults.retry,
    ...(input.retry || {}),
    maxAttempts: input.maxAttempts || input.retry?.maxAttempts || state.defaults.retry.maxAttempts
  });
  return {
    kind: FRONTIER_QUEUE_JOB_KIND,
    version: FRONTIER_QUEUE_JOB_VERSION,
    id: id || input.id || nextId(state, 'job'),
    queue,
    status: 'queued',
    payload: input.payload === undefined ? undefined : cloneJson(input.payload),
    patch: input.patch ? input.patch.map((op) => cloneJson(op) as any) : undefined,
    dedupeKey: input.dedupeKey,
    dedupeMode: input.dedupeMode || (input.dedupeKey ? 'drop' : 'none'),
    priority: Math.floor(input.priority || 0),
    groupKey: input.groupKey,
    runAt,
    availableAt: runAt,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    acquiredCount: 0,
    deliveryCount: 0,
    stalledCount: 0,
    maxAttempts: retry.maxAttempts,
    maxStalls: Math.max(0, Math.floor(input.maxStalls ?? state.defaults.maxStalls)),
    retry,
    leaseMs: Math.max(1, Math.floor(input.leaseMs || state.defaults.leaseMs)),
    tags: [...(input.tags || [])],
    metadata: cloneObject(input.metadata)
  };
}

function createEvent(
  state: FrontierQueueState,
  type: string,
  at: number,
  input: {
    jobId?: string;
    queue?: string;
    reason?: string;
    workerId?: string;
    leaseToken?: string;
    metadata?: JsonObject;
  } = {}
): FrontierQueueEvent {
  return {
    kind: FRONTIER_QUEUE_EVENT_KIND,
    version: FRONTIER_QUEUE_EVENT_VERSION,
    id: nextId(state, 'event'),
    type,
    jobId: input.jobId,
    queue: input.queue,
    at,
    reason: input.reason,
    workerId: input.workerId,
    leaseToken: input.leaseToken,
    metadata: cloneObject(input.metadata)
  };
}

function createDeadLetter(
  state: FrontierQueueState,
  job: FrontierQueueJob,
  now: number,
  reason: string,
  error?: FrontierQueueError,
  metadata?: JsonObject
): FrontierQueueDeadLetter {
  return {
    kind: FRONTIER_QUEUE_DEAD_LETTER_KIND,
    version: FRONTIER_QUEUE_DEAD_LETTER_VERSION,
    id: nextId(state, 'dead'),
    jobId: job.id,
    queue: job.queue,
    deadLetterQueue: state.defaults.deadLetterQueue,
    failedAt: now,
    attempts: job.attempts,
    deliveryCount: job.deliveryCount,
    reason,
    error: error ? cloneJson(error as unknown as JsonValue) as unknown as FrontierQueueError : undefined,
    job: cloneJob(job),
    metadata: cloneObject(metadata)
  };
}

function cloneStateForMutation(state: FrontierQueueState): FrontierQueueState {
  return {
    ...state,
    defaults: { ...state.defaults, retry: { ...state.defaults.retry, retryOn: [...state.defaults.retry.retryOn], nonRetryable: [...state.defaults.retry.nonRetryable] } },
    jobs: state.jobs.map(cloneJob),
    deadLetters: state.deadLetters.map(cloneDeadLetter),
    events: state.events.map(cloneEvent),
    metadata: cloneObject(state.metadata)
  };
}

function cloneJob(job: FrontierQueueJob): FrontierQueueJob {
  return cloneJson(job as unknown as JsonValue) as unknown as FrontierQueueJob;
}

function cloneEvent(event: FrontierQueueEvent): FrontierQueueEvent {
  return cloneJson(event as unknown as JsonValue) as unknown as FrontierQueueEvent;
}

function cloneDeadLetter(dead: FrontierQueueDeadLetter): FrontierQueueDeadLetter {
  return cloneJson(dead as unknown as JsonValue) as unknown as FrontierQueueDeadLetter;
}

function cloneObject(value?: JsonObject): JsonObject | undefined {
  return value === undefined ? undefined : cloneJson(value) as JsonObject;
}

function patchValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function patchValues(values: readonly unknown[]): JsonValue[] {
  return values as JsonValue[];
}

function compileQueueIndexes(state: FrontierQueueState): QueueIndexes {
  const byId = new Map<string, number>();
  const dedupe = new Map<string, number>();
  for (let index = 0; index < state.jobs.length; index++) {
    const job = state.jobs[index];
    byId.set(job.id, index);
    if (job.dedupeKey && ACTIVE_DEDUPE_STATUSES.has(job.status)) {
      const scope = dedupeScope(job.queue, job.dedupeKey);
      if (!dedupe.has(scope)) dedupe.set(scope, index);
    }
  }
  return { byId, dedupe };
}

function createLockedGroups(state: FrontierQueueState): Set<string> {
  const lockedGroups = new Set<string>();
  for (const job of state.jobs) {
    if (job.status === 'leased' && job.groupKey) lockedGroups.add(groupScope(job.queue, job.groupKey));
  }
  return lockedGroups;
}

function findNextReadyJobIndex(state: FrontierQueueState, now: number, queue: string | undefined, lockedGroups: Set<string>): number {
  let bestIndex = -1;
  for (let index = 0; index < state.jobs.length; index++) {
    const job = state.jobs[index];
    if (queue && job.queue !== queue) continue;
    if (!READY_STATUSES.has(job.status) || job.availableAt > now) continue;
    if (job.groupKey && lockedGroups.has(groupScope(job.queue, job.groupKey))) continue;
    if (bestIndex === -1 || compareReadyJobs(job, state.jobs[bestIndex]) < 0) bestIndex = index;
  }
  return bestIndex;
}

function compareReadyJobs(left: FrontierQueueJob, right: FrontierQueueJob): number {
  if (left.priority !== right.priority) return right.priority - left.priority;
  if (left.availableAt !== right.availableAt) return left.availableAt - right.availableAt;
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function requireJobIndex(state: FrontierQueueState, jobId: string): number {
  for (let index = 0; index < state.jobs.length; index++) {
    if (state.jobs[index].id === jobId) return index;
  }
  throw new RangeError('queue job not found: ' + jobId);
}

function assertLease(job: FrontierQueueJob, token?: string): void {
  if (!token) return;
  if (!job.lease || job.lease.token !== token) throw new Error('queue job lease token mismatch: ' + job.id);
}

function shouldRetry(job: FrontierQueueJob, error: FrontierQueueError, nextDeliveryCount: number): boolean {
  if (!error.retryable) return false;
  if (nextDeliveryCount >= job.retry.maxAttempts) return false;
  if (job.retry.nonRetryable.includes(error.type)) return false;
  if (job.retry.retryOn.length && !job.retry.retryOn.includes(error.type)) return false;
  return true;
}

function normalizeError(error: string | Partial<FrontierQueueError> | undefined, retryable = true): FrontierQueueError {
  if (typeof error === 'string') return { type: 'Error', message: error, retryable };
  return {
    type: error?.type || 'Error',
    message: error?.message || 'queue job failed',
    retryable: error?.retryable ?? retryable,
    metadata: cloneObject(error?.metadata)
  };
}

function mergePayload(existing: JsonValue | undefined, next: JsonValue | undefined): JsonValue | undefined {
  if (Array.isArray(existing) && Array.isArray(next)) return [...cloneJson(existing), ...cloneJson(next)] as JsonValue;
  if (next !== undefined) return cloneJson(next);
  return existing === undefined ? undefined : cloneJson(existing);
}

function mergeObjects(left?: JsonObject, right?: JsonObject): JsonObject | undefined {
  if (!left && !right) return undefined;
  return { ...(left || {}), ...(right || {}) };
}

function metadataWithDedupeKey(dedupeKey?: string): JsonObject | undefined {
  return dedupeKey ? { dedupeKey } : undefined;
}

function dedupeScope(queue: string, key: string): string {
  return queue + '\0' + key;
}

function groupScope(queue: string, key: string): string {
  return queue + '\0' + key;
}

function createLeaseToken(state: FrontierQueueState, job: FrontierQueueJob, workerId: string): string {
  return 'lease_' + hashQueueValue([state.id, job.id, workerId, state.sequence, job.acquiredCount]);
}

function nextId(state: FrontierQueueState, prefix: string): string {
  state.sequence++;
  return prefix + '_' + state.sequence.toString(36);
}

function normalizeTime(value?: number | string): number {
  if (value === undefined) return 0;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) throw new TypeError('invalid queue time: ' + value);
    return parsed;
  }
  if (!Number.isFinite(value)) throw new TypeError('invalid queue time: ' + value);
  return Math.floor(value);
}

function deterministicRandom(seed: string): number {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  state = (state + 0x6d2b79f5) >>> 0;
  let value = state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
