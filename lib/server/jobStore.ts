import fs from "node:fs/promises";
import path from "node:path";
import { DOWNLOAD_DIR } from "@/lib/server/downloadDir";
import { getJobTtlMs } from "@/lib/server/reliability";

export type JobStatus = "pending" | "processing" | "completed" | "error";

export interface Job {
  id: string;
  status: JobStatus;
  progress?: number;
  file?: string;
  file_url?: string;
  error?: string;
  errorCode?: string;
  retryable?: boolean;
  requestKey?: string;
  createdAt: number;
  updatedAt: number;
}

type JobStoreState = { jobs: Map<string, Job> };
const globalForJobs = globalThis as typeof globalThis & {
  __darkdropJobStore?: JobStoreState;
};
const state = globalForJobs.__darkdropJobStore ?? (globalForJobs.__darkdropJobStore = { jobs: new Map() });
const jobs = state.jobs;
const jobTtlMs = getJobTtlMs();
const maxActiveJobAgeMs = Math.max(jobTtlMs, 15 * 60 * 1000);

function removeExpiredJob(id: string, job: Job): void {
  jobs.delete(id);
  if (!job.file) return;
  const filePath = path.join(DOWNLOAD_DIR, path.basename(job.file));
  void fs.rm(filePath, { force: true }).catch(() => {
    console.error("[job-store] expired file cleanup failed");
  });
}

function cleanupOldJobs(): void {
  const now = Date.now();
  const terminalCutoff = now - jobTtlMs;
  const activeCutoff = now - maxActiveJobAgeMs;
  for (const [id, job] of jobs) {
    const active = job.status === "pending" || job.status === "processing";
    if ((active && job.createdAt < activeCutoff) || (!active && job.updatedAt < terminalCutoff)) {
      removeExpiredJob(id, job);
    }
  }
}

if (typeof setInterval !== "undefined") {
  const timer = setInterval(cleanupOldJobs, 60 * 1000);
  timer.unref();
}

export const jobStore = {
  createJob(id: string, requestKey?: string): Job {
    const now = Date.now();
    const job: Job = { id, status: "pending", requestKey, createdAt: now, updatedAt: now };
    jobs.set(id, job);
    return job;
  },

  createOrGetActiveJob(
    id: string,
    requestKey: string,
    maxActive: number,
  ): { job: Job; duplicate: boolean } | undefined {
    cleanupOldJobs();
    const existing = Array.from(jobs.values()).find(
      (job) =>
        job.requestKey === requestKey &&
        (job.status === "pending" || job.status === "processing"),
    );
    if (existing) return { job: existing, duplicate: true };

    const activeCount = Array.from(jobs.values()).filter(
      (job) => job.status === "pending" || job.status === "processing",
    ).length;
    if (activeCount >= maxActive) return undefined;

    return { job: this.createJob(id, requestKey), duplicate: false };
  },

  updateJob(id: string, updates: Partial<Job>): Job | undefined {
    const job = jobs.get(id);
    if (!job) return undefined;

    const updated = { ...job, ...updates, updatedAt: Date.now() };
    jobs.set(id, updated);
    return updated;
  },

  getJob(id: string): Job | undefined {
    const job = jobs.get(id);
    if (job && (
      (job.status === "pending" || job.status === "processing")
        ? job.createdAt < Date.now() - maxActiveJobAgeMs
        : job.updatedAt < Date.now() - jobTtlMs
    )) {
      removeExpiredJob(id, job);
      return undefined;
    }
    return job;
  },

  deleteJob(id: string): void {
    const job = jobs.get(id);
    if (job) removeExpiredJob(id, job);
  },
};
