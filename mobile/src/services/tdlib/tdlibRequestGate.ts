/** Limit parallel TDLib JSON requests — flooding the native bridge causes @extra mismatches and session drops. */
const MAX_IN_FLIGHT = 3;

let inFlight = 0;
const waitQueue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waitQueue.push(() => {
      inFlight += 1;
      resolve();
    });
  });
}

function release(): void {
  inFlight = Math.max(0, inFlight - 1);
  const next = waitQueue.shift();
  if (next) next();
}

export async function withTdlibRequestGate<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}
