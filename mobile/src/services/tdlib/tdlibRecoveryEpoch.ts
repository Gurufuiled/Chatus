export type TdlibRecoveryEpoch = {
  capture: () => number;
  cancel: () => number;
  isCurrent: (capturedEpoch: number) => boolean;
};

export type TdlibRecoveryBoundaryResult<T> =
  | { cancelled: true }
  | { cancelled: false; value: T };

export function createTdlibRecoveryEpoch(initialEpoch = 0): TdlibRecoveryEpoch {
  let epoch = initialEpoch;
  return {
    capture: () => epoch,
    cancel: () => {
      epoch += 1;
      return epoch;
    },
    isCurrent: (capturedEpoch) => capturedEpoch === epoch,
  };
}

export async function runTdlibRecoveryBoundary<T>(
  epoch: TdlibRecoveryEpoch,
  capturedEpoch: number,
  operation: () => Promise<T>,
): Promise<TdlibRecoveryBoundaryResult<T>> {
  if (!epoch.isCurrent(capturedEpoch)) return { cancelled: true };
  const value = await operation();
  if (!epoch.isCurrent(capturedEpoch)) return { cancelled: true };
  return { cancelled: false, value };
}
