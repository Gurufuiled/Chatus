/**
 * TDLib допускает только один «authorization query» одновременно
 * (`setAuthenticationPhoneNumber`, `checkAuthenticationCode`, `checkAuthenticationPassword`, …).
 * Параллельные вызовы дают ошибку вида «another authorization query has started».
 *
 * Очередь на весь процесс JS (один `TdlibModule` / один `client_id` на приложение).
 */
let authChainTail: Promise<void> = Promise.resolve();

export function runTdlibAuthorizationQuery<T>(fn: () => Promise<T>): Promise<T> {
  const run = authChainTail.then(() => fn());
  authChainTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
