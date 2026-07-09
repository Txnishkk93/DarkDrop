export type JobStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface Job {
  id: string;
  status: JobStatus;
  progress?: number;
  file?: string;
  file_url?: string;
  error?: string;
  createdAt: number;
}

const globalForJobs = globalThis as unknown as {
  jobs: Map<string, Job>;
};

const jobs = globalForJobs.jobs || new Map<string, Job>();
if (process.env.NODE_ENV !== 'production') globalForJobs.jobs = jobs;

// Fallback cleanup timer (15 minutes)
const CLEANUP_INTERVAL = 15 * 60 * 1000;

function cleanupOldJobs() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > CLEANUP_INTERVAL) {
      jobs.delete(id);
    }
  }
}

// Run cleanup periodically (in memory)
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupOldJobs, CLEANUP_INTERVAL);
}

export const jobStore = {
  createJob(id: string): Job {
    const job: Job = {
      id,
      status: 'pending',
      createdAt: Date.now(),
    };
    jobs.set(id, job);
    return job;
  },

  updateJob(id: string, updates: Partial<Job>): Job | undefined {
    const job = jobs.get(id);
    if (!job) return undefined;

    const updated = { ...job, ...updates };
    jobs.set(id, updated);
    return updated;
  },

  getJob(id: string): Job | undefined {
    return jobs.get(id);
  },

  deleteJob(id: string): void {
    jobs.delete(id);
  }
};
