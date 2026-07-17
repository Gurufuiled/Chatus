export type AuthKeyDropLogoutDependencies = {
  enterExclusiveDestroyMode: () => void;
  sendTdlib: (query: { '@type': 'destroy' }) => Promise<unknown>;
  waitForClosed: (timeoutMs: number) => Promise<void>;
  clearLocalSession: () => Promise<void>;
  prepareFreshLogin: () => Promise<unknown>;
  closedTimeoutMs?: number;
};

export async function performConfirmedAuthKeyDropLogout(
  dependencies: AuthKeyDropLogoutDependencies,
): Promise<void> {
  dependencies.enterExclusiveDestroyMode();
  // Closed is the source of truth. Destroy send is best-effort: a reject must not
  // abort cleanup when TDLib already reached Closed (or is about to).
  let destroySendError: Error | null = null;
  const destroySend = dependencies.sendTdlib({ '@type': 'destroy' }).then(
    () => undefined,
    (error: unknown) => {
      destroySendError =
        error instanceof Error
          ? error
          : new Error('Не удалось отправить команду завершения сессии Telegram.');
    },
  );
  try {
    await dependencies.waitForClosed(dependencies.closedTimeoutMs ?? 12_000);
  } catch (closedError) {
    await destroySend.catch(() => undefined);
    if (destroySendError) {
      throw new Error(
        'Не удалось завершить сессию Telegram. Попробуйте ещё раз.',
      );
    }
    throw closedError;
  }
  await destroySend.catch(() => undefined);
  await dependencies.clearLocalSession();
  try {
    await dependencies.prepareFreshLogin();
  } catch {
    throw new Error('Сессия завершена, но не удалось подготовить новый вход в Telegram.');
  }
}

export function createAuthKeyDropAlertActions(options: {
  releaseAlert: () => void;
  startAction: () => void;
  finishAction: () => void;
  performLogout: () => Promise<void>;
  onError: (error: unknown) => void;
}): { cancel: () => void; confirm: () => void } {
  return {
    cancel: options.releaseAlert,
    confirm: () => {
      options.releaseAlert();
      options.startAction();
      void options.performLogout().catch(options.onError).finally(options.finishAction);
    },
  };
}
