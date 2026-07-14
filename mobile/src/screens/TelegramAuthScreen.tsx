import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useFocusEffect,
  useNavigation,
  type NavigationProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type {
  MainTabParamList,
  SettingsStackParamList,
} from "../navigation/types";
import { useTheme } from "../contexts/ThemeContext";
import {
  getTelegramBuildCredentials,
  tdlibClient,
} from "../services/tdlib/TdlibClient";
import { applyTdlibParameters, ensureTdlibReadyForPhoneLogin } from "../services/tdlib/tdlibBootstrap";
import { probeTdlibAuthStatus } from "../services/tdlib/tdlibAuthState";
import { throwIfTdError } from "../services/tdlib/tdlibErrors";
import { runTdlibAuthorizationQuery } from "../services/tdlib/tdlibAuthQueue";
import {
  telegramAccountStore,
  type TelegramAuthStatus,
} from "../stores/telegramAccountStore";
import { requestContactsAndSync } from "../services/ContactSyncService";
import { syncChatusPhoneFromTelegramAuth } from "../services/telegramChatusPhoneSync";
import {
  getAuthWizardStepIndex,
  resolveAuthWizardStep,
  showCodeDeliveryInfo,
  type AuthWizardStep,
} from "./telegramAuth/telegramAuthPresentation";
import {
  formatTdlibAuthError,
  readWaitPasswordAuthInfo,
} from "./telegramAuth/tdlibAuthErrors";
import { mapTdlibAuthStateToStore } from "../services/tdlib/tdlibAuthState";
import { AuthWizardTextField } from "./telegramAuth/AuthWizardTextField";
import { TelegramAuthPasswordDock } from "./telegramAuth/TelegramAuthPasswordDock";
import { TelegramAuthPhoneFields } from "./telegramAuth/TelegramAuthPhoneFields";
import { waitForAuthorizationTransition } from "./telegramAuth/tdlibAuthFlow";

const WIZARD_STEPS: AuthWizardStep[] = ["phone", "code", "password"];

const STEP_COPY: Record<AuthWizardStep, { title: string; subtitle: string }> = {
  phone: {
    title: "Номер телефона",
    subtitle: "Отдельный аккаунт от Chatus. Код придёт в Telegram или по SMS.",
  },
  code: {
    title: "Код подтверждения",
    subtitle: "Введите цифры из Telegram или SMS.",
  },
  password: {
    title: "Двухэтапная проверка",
    subtitle: "Облачный пароль из настроек Telegram → Конфиденциальность.",
  },
};

function mapTdlibAuthToStore(
  authType: string | undefined,
  current: TelegramAuthStatus = "idle",
): TelegramAuthStatus {
  return mapTdlibAuthStateToStore(authType, current);
}

/** TDLib ждёт международный номер; «+» для страны нужен. Нормализуем типичный ввод РФ (8… / 7… / 9…). */
function normalizeTelegramPhone(raw: string): string {
  const collapsed = raw.replace(/[\s().-]/g, "").trim();
  if (!collapsed) return "";
  if (collapsed.startsWith("+")) {
    const rest = collapsed.slice(1).replace(/\D/g, "");
    return rest ? `+${rest}` : "";
  }
  const digits = collapsed.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+${digits}`;
  }
  if (digits.length === 10 && digits.startsWith("9")) {
    return `+7${digits}`;
  }
  return digits ? `+${digits}` : "";
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

function isAuthFlowTimeout(message: string): boolean {
  return (
    message.includes("не подтвердил код за") ||
    message.includes("не подтвердил пароль за")
  );
}

function defaultPhoneNumberAuthenticationSettings(): Record<string, unknown> {
  return {
    "@type": "phoneNumberAuthenticationSettings",
    allow_flash_call: false,
    allow_missed_call: false,
    is_current_phone_number: false,
    /**
     * has_unknown_phone_number: false — не сообщаем TDLib что мы «не знаем» свой номер.
     * Если true на Android — TDLib ждёт SIM-верификацию, которая никогда не приходит
     * в сторонних приложениях → бесконечная загрузка.
     */
    has_unknown_phone_number: false,
    allow_sms_retriever_api: false,
    authentication_tokens: [],
  };
}

export function TelegramAuthScreen() {
  const { colors, resolvedScheme } = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [cloudPassword, setCloudPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const [hasPasswordRecoveryEmail, setHasPasswordRecoveryEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const firstScreenFocus = useRef(true);
  /** Не уводить в чаты, если пользователь уже ушёл с экрана, а sync завершился позже. */
  const screenFocusedRef = useRef(false);
  const authWaitAbortRef = useRef<AbortController | null>(null);

  const { apiId, apiHash } = useMemo(() => getTelegramBuildCredentials(), []);
  const isLight = resolvedScheme === "light";

  const ui = useMemo(() => {
    const label = isLight ? "#4A5568" : colors.textSecondary;
    const hint = isLight ? "#5A6578" : colors.textSecondary;
    const placeholder = isLight
      ? "rgba(0,0,0,0.38)"
      : colors.textSecondaryMuted;
    const fieldBg = isLight ? "#FFFFFF" : colors.inputBackgroundSolid;
    const border = isLight ? "#B8C0CC" : colors.separator;
    const secondaryBtnBg = isLight ? "#E8EDF4" : colors.inputBackgroundSolid;
    return { label, hint, placeholder, fieldBg, border, secondaryBtnBg };
  }, [colors, isLight]);

  const inputFieldStyle = useMemo(
    () => [
      styles.input,
      {
        borderColor: ui.border,
        backgroundColor: ui.fieldBg,
        color: colors.textPrimary,
      },
    ],
    [colors.textPrimary, ui.border, ui.fieldBg],
  );

  const openTelegramChats = useCallback(() => {
    navigation
      .getParent<NavigationProp<MainTabParamList>>()
      ?.navigate("Chats", { screen: "ChatList" });
  }, [navigation]);

  const completeAuthSuccess = useCallback(
    async (options?: { navigateToChats?: boolean }) => {
      telegramAccountStore.getState().setAuthStatus("ready");
      telegramAccountStore.getState().setTelegramUserId(0);
      await telegramAccountStore.getState().persistSnapshot();
      syncChatusPhoneFromTelegramAuth().catch(console.error);
      requestContactsAndSync().catch(console.error);

      if (navigation.canGoBack()) {
        navigation.popToTop();
      }

      const goChats = options?.navigateToChats !== false;
      if (goChats && screenFocusedRef.current) {
        telegramAccountStore.getState().setDialogsSyncing(true);
        openTelegramChats();
        return;
      }
      if (goChats && !screenFocusedRef.current) {
        Alert.alert(
          "Telegram",
          "Вход выполнен. Откройте вкладку «Чаты», чтобы увидеть диалоги Telegram.",
        );
      }
    },
    [navigation, openTelegramChats],
  );

  const syncAuthorizationFromTdlib =
    useCallback(async (): Promise<TelegramAuthStatus> => {
      if (apiId == null || !apiHash) {
        return telegramAccountStore.getState().authStatus;
      }
      let t: string | undefined;
      try {
        t = await ensureTdlibReadyForPhoneLogin();
      } catch {
        await applyTdlibParameters().catch(() => undefined);
        const auth = (await tdlibClient.send({
          "@type": "getAuthorizationState",
        })) as { "@type"?: string };
        throwIfTdError(auth);
        t = auth["@type"];
      }
      if (t === "authorizationStateWaitTdlibParameters") {
        throw new Error(
          "Не удалось инициализировать Telegram. Перезапустите приложение.",
        );
      }
      if (t === "authorizationStateReady") {
        telegramAccountStore.getState().setAuthStatus("ready");
        await telegramAccountStore.getState().persistSnapshot();
        syncChatusPhoneFromTelegramAuth().catch(console.error);
        requestContactsAndSync().catch(console.error);
        return "ready";
      }
      const current = telegramAccountStore.getState().authStatus;
      // After logout we already know we need the phone form — don't wait for probe recovery.
      if (
        current === "waiting_phone" ||
        current === "waiting_code" ||
        current === "waiting_password" ||
        current === "idle"
      ) {
        if (
          t === "authorizationStateWaitPhoneNumber" ||
          t === "authorizationStateWaitEmailAddress" ||
          t === "authorizationStateWaitRegistration"
        ) {
          if (current !== "waiting_phone") {
            telegramAccountStore.getState().setAuthStatus("waiting_phone");
            await telegramAccountStore.getState().persistSnapshot();
          }
          return "waiting_phone";
        }
        if (
          t === "authorizationStateWaitCode" ||
          t === "authorizationStateWaitEmailCode"
        ) {
          if (current !== "waiting_code") {
            telegramAccountStore.getState().setAuthStatus("waiting_code");
            await telegramAccountStore.getState().persistSnapshot();
          }
          return "waiting_code";
        }
        if (t === "authorizationStateWaitPassword") {
          if (current !== "waiting_password") {
            telegramAccountStore.getState().setAuthStatus("waiting_password");
            await telegramAccountStore.getState().persistSnapshot();
          }
          return "waiting_password";
        }
      }
      const probed = await probeTdlibAuthStatus(current);
      if (probed.status !== current) {
        telegramAccountStore.getState().setAuthStatus(probed.status);
        await telegramAccountStore.getState().persistSnapshot();
      }
      return probed.status;
    }, [apiHash, apiId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      screenFocusedRef.current = true;
      if (apiId == null || !apiHash) {
        setPreparing(false);
        return () => {
          cancelled = true;
          screenFocusedRef.current = false;
        };
      }
      const showBlockingSpinner = firstScreenFocus.current;
      firstScreenFocus.current = false;
      if (showBlockingSpinner) setPreparing(true);
      void (async () => {
        try {
          setBootstrapError(null);
          await syncAuthorizationFromTdlib();
        } catch (e) {
          if (!cancelled) {
            setBootstrapError(e instanceof Error ? e.message : String(e));
          }
        } finally {
          if (!cancelled) setPreparing(false);
        }
      })();
      return () => {
        cancelled = true;
        screenFocusedRef.current = false;
        authWaitAbortRef.current?.abort();
        authWaitAbortRef.current = null;
      };
    }, [apiHash, apiId, syncAuthorizationFromTdlib]),
  );

  const submitPhone = useCallback(async (rawPhone?: string) => {
    const trimmed = normalizeTelegramPhone(rawPhone ?? phone);
    if (!trimmed || trimmed.length < 8) {
      Alert.alert(
        "Телефон",
        "Укажите номер в международном формате: +7 и 10 цифр (например +79881234567). Можно ввести 8 988… или 988… — мы подставим +7.",
      );
      return;
    }
    if (apiId == null || !apiHash) {
      Alert.alert(
        "Нет ключей Telegram API",
        "Для сборки нужны TELEGRAM_API_ID и TELEGRAM_API_HASH (см. mobile/TDLIB.md).",
      );
      return;
    }
    setBusy(true);
    try {
      setBootstrapError(null);

      const currentStatus = telegramAccountStore.getState().authStatus;
      if (currentStatus === "ready") {
        if (navigation.canGoBack()) navigation.popToTop();
        return;
      }
      if (currentStatus === "waiting_code") {
        Alert.alert("Код уже отправлен", "Введите код на этом шаге.");
        return;
      }
      if (currentStatus === "waiting_password") {
        Alert.alert(
          "Нужен пароль 2FA",
          "Сначала введите код. Пароль запросится на следующем шаге.",
        );
        return;
      }

      await withTimeout(
        ensureTdlibReadyForPhoneLogin(),
        30000,
        "TDLib не смог подготовить вход за 30 с. Перезапустите приложение.",
      );

      const authProbe = (await withTimeout(
        tdlibClient.send({
          "@type": "getAuthorizationState",
        }) as Promise<unknown>,
        20000,
        "TDLib не ответил на getAuthorizationState за 20 с.",
      )) as { "@type"?: string };
      throwIfTdError(authProbe);
      let probeType = authProbe["@type"];

      // Last-chance recover if still Closed after ensure (race with native logout).
      if (
        probeType === "authorizationStateClosed" ||
        probeType === "authorizationStateClosing" ||
        probeType === "authorizationStateLoggingOut" ||
        probeType === "authorizationStateWaitTdlibParameters"
      ) {
        probeType = await withTimeout(
          ensureTdlibReadyForPhoneLogin(),
          20000,
          "TDLib застрял после закрытия сессии. Перезапустите приложение.",
        );
      }

      if (probeType === "authorizationStateReady") {
        await completeAuthSuccess();
        return;
      }
      if (
        probeType === "authorizationStateWaitCode" ||
        probeType === "authorizationStateWaitEmailCode"
      ) {
        telegramAccountStore.getState().setAuthStatus("waiting_code");
        await telegramAccountStore.getState().persistSnapshot();
        Alert.alert("Код уже отправлен", "Введите код на этом шаге.");
        return;
      }
      if (probeType === "authorizationStateWaitPassword") {
        telegramAccountStore.getState().setAuthStatus("waiting_password");
        await telegramAccountStore.getState().persistSnapshot();
        Alert.alert(
          "Нужен пароль 2FA",
          "Сначала введите код. Пароль запросится на следующем шаге.",
        );
        return;
      }
      if (
        probeType !== "authorizationStateWaitPhoneNumber" &&
        probeType !== "authorizationStateWaitEmailAddress" &&
        probeType !== "authorizationStateWaitRegistration"
      ) {
        Alert.alert(
          "Telegram",
          `Не удалось начать вход (состояние: ${probeType ?? "?"}). Перезапустите приложение и попробуйте снова.`,
        );
        return;
      }

      telegramAccountStore.getState().setAuthStatus("waiting_phone");

      // Проверяем сеть до отправки номера — если TDLib не может достучаться
      // до серверов Telegram, сразу покажем ошибку вместо 4-мин зависания
      try {
        const netResult = (await withTimeout(
          tdlibClient.send({ "@type": "testNetwork" }) as Promise<unknown>,
          15000,
          "testNetwork timeout",
        )) as { "@type"?: string };
        console.log("[TDLib] testNetwork result:", JSON.stringify(netResult));
        if ((netResult as { "@type"?: string })?.["@type"] !== "ok") {
          throw new Error(`testNetwork вернул: ${JSON.stringify(netResult)}`);
        }
        console.log("[TDLib] ✅ Telegram серверы достижимы");
      } catch (netErr: unknown) {
        const netMsg =
          netErr instanceof Error ? netErr.message : String(netErr);
        console.warn("[TDLib] ⚠️ testNetwork FAILED:", netMsg);
        // Не прерываем — попробуем отправить номер всё равно, но логируем
      }

      await runTdlibAuthorizationQuery(async () => {
        /**
         * ВАЖНО: TDLib при обработке setAuthenticationPhoneNumber сначала шлёт
         * updateAuthorizationState { waitCode } (push без @extra), а потом возвращает ok.
         *
         * ПРОБЛЕМА: нативный TdlibModule имеет таймаут 4 минуты (SEND_TIMEOUT_MS).
         * Если он сработал — Promise отклоняется с E_TD_TIMEOUT, но TDLib продолжает
         * работать! При FLOOD_WAIT TDLib ждёт внутри (до 5+ мин) и только потом отвечает.
         *
         * РЕШЕНИЕ: при E_TD_TIMEOUT — НЕ отклонять Promise, продолжать слушать
         * updateAuthorizationState push-события. setBusy(false) не вызывается.
         * Итоговый таймаут 10 минут. Через 30 сек — показываем info-сообщение.
         */
        const result = await new Promise<unknown>((resolve, reject) => {
          let settled = false;
          let nativeTimedOut = false;

          // Итоговый таймаут 10 минут (больше нативного 4-минутного таймаута)
          const totalTimer = setTimeout(() => {
            if (settled) return;
            settled = true;
            unsubTdlib();
            reject(
              new Error(
                "Telegram не ответил за 10 минут при отправке номера. " +
                  "Скорее всего активен FLOOD_WAIT — Telegram временно " +
                  "заблокировал отправку кода на этот номер (слишком много попыток). " +
                  "Подождите 30+ минут и повторите.",
              ),
            );
          }, 600_000);

          // Через 30 секунд показываем информацию что ещё ждём
          const slowTimer = setTimeout(() => {
            if (!settled && screenFocusedRef.current) {
              setBootstrapError(
                nativeTimedOut
                  ? "TDLib ожидает ответа Telegram (возможно FLOOD_WAIT). Не закрывайте экран…"
                  : "Ожидаем ответа Telegram, это может занять несколько минут…",
              );
            }
          }, 30_000);

          // Слушаем updateAuthorizationState — если TDLib перешёл в waitCode, сразу успех
          const unsubTdlib = tdlibClient.subscribe((update) => {
            if (settled) return;
            try {
              if (update["@type"] !== "updateAuthorizationState") return;
              const authState = update["authorization_state"] as
                | Record<string, unknown>
                | undefined;
              const stateType = authState?.["@type"] as string | undefined;
              if (
                stateType === "authorizationStateWaitCode" ||
                stateType === "authorizationStateWaitEmailCode" ||
                stateType === "authorizationStateWaitOtherDeviceConfirmation" ||
                stateType === "authorizationStateReady"
              ) {
                settled = true;
                clearTimeout(totalTimer);
                clearTimeout(slowTimer);
                unsubTdlib();
                resolve({
                  "@type": "ok",
                  _resolvedBy: "updateAuthorizationState",
                  _state: stateType,
                });
              } else if (
                stateType === "authorizationStateLoggingOut" ||
                stateType === "authorizationStateClosing" ||
                stateType === "authorizationStateClosed"
              ) {
                settled = true;
                clearTimeout(totalTimer);
                clearTimeout(slowTimer);
                unsubTdlib();
                reject(
                  new Error(
                    `TDLib перешёл в состояние ${stateType} — сессия прервана.`,
                  ),
                );
              }
            } catch {
              /* ignore parse errors */
            }
          });

          // Отправляем номер — обрабатываем ответ
          void (
            tdlibClient.send({
              "@type": "setAuthenticationPhoneNumber",
              phone_number: trimmed,
              settings: defaultPhoneNumberAuthenticationSettings(),
            }) as Promise<unknown>
          ).then(
            (res) => {
              if (settled) return;
              settled = true;
              clearTimeout(totalTimer);
              clearTimeout(slowTimer);
              unsubTdlib();
              resolve(res);
            },
            (err: unknown) => {
              if (settled) return;
              const errCode = (err as { code?: string })?.code ?? "";
              const errMsg = err instanceof Error ? err.message : String(err);

              // E_TD_TIMEOUT = нативный 4-мин таймаут — TDLib ещё работает внутри!
              // Не отклоняем Promise, ждём push-события (до 10 мин итого).
              if (
                errCode === "E_TD_TIMEOUT" ||
                errMsg.includes("нет ответа за")
              ) {
                nativeTimedOut = true;
                if (screenFocusedRef.current) {
                  setBootstrapError(
                    "Telegram ещё обрабатывает запрос (возможно FLOOD_WAIT). " +
                      "Продолжаем ожидание — не нажимайте кнопку снова.",
                  );
                }
                return; // НЕ reject — ждём дальше
              }

              // "Another authorization query has started" — значит TDLib уже начал
              // обрабатывать новый запрос. Ждём updateAuthorizationState push.
              if (errMsg.includes("Another authorization query")) {
                nativeTimedOut = true;
                if (screenFocusedRef.current) {
                  setBootstrapError(
                    "TDLib обрабатывает новый запрос авторизации, ожидаем…",
                  );
                }
                return; // НЕ reject — ждём push
              }

              // Реальная ошибка (PHONE_NUMBER_INVALID, PHONE_NUMBER_BANNED, и т.д.)
              settled = true;
              clearTimeout(totalTimer);
              clearTimeout(slowTimer);
              unsubTdlib();
              reject(err instanceof Error ? err : new Error(errMsg));
            },
          );
        });

        throwIfTdError(result);
        telegramAccountStore.getState().setPhoneHint(trimmed);
        telegramAccountStore.getState().setAuthStatus("waiting_code");
        await telegramAccountStore.getState().persistSnapshot();
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (screenFocusedRef.current) {
        setBootstrapError(msg);
        Alert.alert("Telegram", msg);
      }
    } finally {
      setBusy(false);
    }
  }, [apiHash, apiId, completeAuthSuccess, navigation, phone]);

  const resendAuthCode = useCallback(async () => {
    if (telegramAccountStore.getState().authStatus !== "waiting_code") return;
    setBusy(true);
    try {
      await runTdlibAuthorizationQuery(async () => {
        if (telegramAccountStore.getState().authStatus !== "waiting_code")
          return;
        const r = await withTimeout(
          tdlibClient.send({
            "@type": "resendAuthenticationCode",
          }) as Promise<unknown>,
          60000,
          "Повторная отправка кода: нет ответа TDLib за 60 с.",
        );
        throwIfTdError(r);
      });
      if (screenFocusedRef.current) {
        Alert.alert(
          "Код",
          "Если сервер разрешил повтор — проверь открытый Telegram на других устройствах и SMS. Иначе подожди таймер в официальном клиенте или попробуй позже.",
        );
      }
    } catch (e) {
      if (screenFocusedRef.current) {
        Alert.alert("Telegram", e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshPasswordStepInfo = useCallback(async () => {
    try {
      await applyTdlibParameters();
      const info = await readWaitPasswordAuthInfo(() =>
        tdlibClient.send({ "@type": "getAuthorizationState" }),
      );
      if (info) {
        setPasswordHint(info.passwordHint);
        setHasPasswordRecoveryEmail(info.hasRecoveryEmail);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const submitCode = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      Alert.alert("Код", "Введите код из Telegram или SMS.");
      return;
    }
    setBusy(true);
    try {
      setBootstrapError(null);
      authWaitAbortRef.current?.abort();
      authWaitAbortRef.current = new AbortController();
      const status = await syncAuthorizationFromTdlib();
      if (status === "ready") {
        await completeAuthSuccess();
        return;
      }
      if (status === "waiting_password") {
        void refreshPasswordStepInfo();
        return;
      }
      if (status !== "waiting_code") {
        Alert.alert(
          "Telegram",
          "Статус входа изменился. Откройте экран заново или сбросьте сессию.",
        );
        return;
      }
      await runTdlibAuthorizationQuery(async () => {
        const storeStatus = telegramAccountStore.getState().authStatus;
        if (storeStatus === "ready") {
          await completeAuthSuccess();
          return;
        }
        if (storeStatus === "waiting_password") {
          void refreshPasswordStepInfo();
          return;
        }
        if (storeStatus !== "waiting_code") {
          throw new Error(
            "Шаг входа изменился. Закройте экран и откройте «Telegram» в настройках снова.",
          );
        }
        const nextState = await waitForAuthorizationTransition(
          {
            acceptStates: new Set([
              "authorizationStateWaitPassword",
              "authorizationStateReady",
            ]),
            timeoutMs: 90_000,
            timeoutMessage:
              "Telegram не подтвердил код за 90 секунд. Проверьте сеть и попробуйте снова.",
            slowAfterMs: 12_000,
            onSlow: () => {
              if (screenFocusedRef.current) {
                setBootstrapError(
                  "Ожидаем ответ Telegram после кода… Если долго висит, закройте экран и попробуйте снова.",
                );
              }
            },
            abortSignal: authWaitAbortRef.current.signal,
          },
          () =>
            tdlibClient.send({
              "@type": "checkAuthenticationCode",
              code: trimmed,
            }),
        );
        setBootstrapError(null);
        if (nextState === "authorizationStateWaitPassword") {
          telegramAccountStore.getState().setAuthStatus("waiting_password");
          await telegramAccountStore.getState().persistSnapshot();
          void refreshPasswordStepInfo();
          return;
        }
        if (nextState === "authorizationStateReady") {
          await completeAuthSuccess();
          return;
        }
        throw new Error(`Неожиданное состояние после кода: ${nextState ?? "?"}`);
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message !== "AUTH_FLOW_ABORTED") {
        if (isAuthFlowTimeout(message)) {
          const reconciled = await syncAuthorizationFromTdlib().catch(() => null);
          if (reconciled === "waiting_password") {
            setBootstrapError(null);
            void refreshPasswordStepInfo();
            return;
          }
          if (reconciled === "ready") {
            setBootstrapError(null);
            await completeAuthSuccess();
            return;
          }
        }
        Alert.alert("Telegram", message);
      }
    } finally {
      authWaitAbortRef.current = null;
      setBusy(false);
    }
  }, [code, completeAuthSuccess, refreshPasswordStepInfo, syncAuthorizationFromTdlib]);

  const submitPassword = useCallback(async () => {
    const password = cloudPassword.trim();
    if (!password) {
      Alert.alert(
        "Пароль",
        "Введите облачный пароль двухэтапной проверки из настроек Telegram.",
      );
      return;
    }
    setBusy(true);
    try {
      setBootstrapError("Проверяем пароль…");
      authWaitAbortRef.current?.abort();
      authWaitAbortRef.current = new AbortController();
      const status = await syncAuthorizationFromTdlib();
      if (status === "ready") {
        setBootstrapError(null);
        await completeAuthSuccess();
        return;
      }
      if (status === "waiting_code") {
        setBootstrapError(null);
        Alert.alert("Telegram", "Сначала введите код подтверждения.");
        return;
      }
      if (status !== "waiting_password") {
        setBootstrapError(null);
        Alert.alert(
          "Telegram",
          "Сессия сброшена или шаг изменился. Откройте экран заново.",
        );
        return;
      }
      await runTdlibAuthorizationQuery(async () => {
        const storeStatus = telegramAccountStore.getState().authStatus;
        if (storeStatus === "ready") {
          await completeAuthSuccess();
          return;
        }
        if (storeStatus !== "waiting_password") {
          throw new Error(
            "Шаг входа изменился. Закройте экран и откройте «Telegram» в настройках снова.",
          );
        }
        const nextState = await waitForAuthorizationTransition(
          {
            acceptStates: new Set(["authorizationStateReady"]),
            timeoutMs: 90_000,
            timeoutMessage:
              "Telegram не подтвердил пароль за 90 секунд. Проверьте сеть и попробуйте снова.",
            slowAfterMs: 12_000,
            onSlow: () => {
              if (screenFocusedRef.current) {
                setBootstrapError(
                  "Ожидаем ответ Telegram после пароля… Если долго висит, попробуйте открыть экран заново.",
                );
              }
            },
            abortSignal: authWaitAbortRef.current.signal,
          },
          () =>
            tdlibClient.send({
              "@type": "checkAuthenticationPassword",
              password,
            }),
        );
        if (nextState === "authorizationStateReady") {
          setBootstrapError(null);
          await completeAuthSuccess();
          return;
        }
        throw new Error(`Сессия не готова: ${nextState ?? "?"}`);
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      if (raw !== "AUTH_FLOW_ABORTED") {
        if (isAuthFlowTimeout(raw)) {
          const reconciled = await syncAuthorizationFromTdlib().catch(() => null);
          if (reconciled === "ready") {
            setBootstrapError(null);
            await completeAuthSuccess();
            return;
          }
        }
        setBootstrapError(null);
        Alert.alert("Telegram", formatTdlibAuthError(raw));
      }
    } finally {
      authWaitAbortRef.current = null;
      setBusy(false);
    }
  }, [cloudPassword, completeAuthSuccess, syncAuthorizationFromTdlib]);

  const resetTg = useCallback(() => {
    Alert.alert(
      "Выйти из Telegram?",
      "Локальная сессия на этом устройстве будет сброшена.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Сбросить",
          style: "destructive",
          onPress: () => {
            void telegramAccountStore.getState().resetTelegramSession();
          },
        },
      ],
    );
  }, []);

  const status = telegramAccountStore((s) => s.authStatus);

  const authStep = resolveAuthWizardStep(status);
  const wizardStepIndex = getAuthWizardStepIndex(authStep);
  const stepCopy = STEP_COPY[authStep];
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (authStep !== "password" || status !== "waiting_password") {
      setPasswordHint(null);
      setHasPasswordRecoveryEmail(false);
      return;
    }
    void refreshPasswordStepInfo();
  }, [authStep, refreshPasswordStepInfo, status]);

  const canSendPhone =
    !preparing && !busy && apiId != null && apiHash && status !== "ready";
  const phonePrimary =
    status === "waiting_phone" ||
    status === "idle" ||
    status === "error" ||
    status === "waiting_parameters";
  const showAuthForm = apiId != null && apiHash && status !== "ready";
  const scrollBottomPad = authStep === "password" ? 168 + Math.max(insets.bottom, 8) : 32;

  return (
    <View style={[styles.flex, { backgroundColor: colors.chatBackground }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        enabled={Platform.OS !== "ios" || authStep !== "password"}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: scrollBottomPad },
          ]}
          keyboardShouldPersistTaps="handled"
          overScrollMode="never"
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
        >
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Telegram
        </Text>

        {showAuthForm ? (
          <View style={styles.progressRow}>
            {WIZARD_STEPS.map((step, index) => (
              <View
                key={step}
                style={[
                  styles.progressDot,
                  {
                    backgroundColor:
                      index <= wizardStepIndex
                        ? colors.accent
                        : isLight
                          ? "#D1D9E6"
                          : colors.separator,
                  },
                ]}
              />
            ))}
          </View>
        ) : null}

        {showAuthForm ? (
          <>
            <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
              {stepCopy.title}
            </Text>
            <Text style={[styles.subtitle, { color: ui.hint }]}>
              {stepCopy.subtitle}
            </Text>
          </>
        ) : (
          <Text style={[styles.subtitle, { color: ui.hint }]}>
            {status === "ready"
              ? "Telegram подключён. Выход — только кнопкой «Выйти из Telegram» внизу (удалит локальный вход на этом устройстве)."
              : "Аккаунт Telegram отдельный от Chatus."}
          </Text>
        )}

        {bootstrapError ? (
          <Text
            style={[
              styles.errorBanner,
              {
                color: "#C62828",
                backgroundColor: isLight ? "#FFEBEE" : "#3A1F1F",
              },
            ]}
          >
            {bootstrapError}
          </Text>
        ) : null}

        {apiId == null || !apiHash ? (
          <View
            style={[
              styles.banner,
              { backgroundColor: ui.fieldBg, borderColor: ui.border },
            ]}
          >
            <Text style={[styles.bannerText, { color: colors.textPrimary }]}>
              В этой сборке не заданы ключи Telegram API (TELEGRAM_API_ID /
              TELEGRAM_API_HASH). См. mobile/TDLIB.md.
            </Text>
          </View>
        ) : null}

        {preparing && apiId != null && apiHash ? (
          <View style={styles.preparingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text
              style={[
                styles.preparingText,
                { color: ui.label, marginLeft: 12 },
              ]}
            >
              Подключение к Telegram…
            </Text>
          </View>
        ) : null}

        {showAuthForm && authStep === "phone" ? (
          <TelegramAuthPhoneFields
            phoneInitialValue={phone}
            onCommitPhone={setPhone}
            onSubmitPhone={submitPhone}
            busy={busy}
            preparing={preparing}
            canSendPhone={!!canSendPhone}
            phonePrimary={phonePrimary}
            colors={colors}
            ui={ui}
            inputFieldStyle={inputFieldStyle}
          />
        ) : null}

        {showAuthForm && authStep === "code" ? (
          <>
            <View style={styles.codeHintRow}>
              <Pressable onPress={showCodeDeliveryInfo} hitSlop={8}>
                <Text style={[styles.linkHint, { color: colors.accent }]}>
                  Где взять код?
                </Text>
              </Pressable>
            </View>
            <AuthWizardTextField
              value={code}
              onChangeText={setCode}
              placeholder="Цифры из Telegram или SMS"
              placeholderTextColor={ui.placeholder}
              keyboardType="number-pad"
              editable={!busy && !preparing}
              style={inputFieldStyle}
            />
            <Pressable
              onPress={() => void resendAuthCode()}
              disabled={busy || preparing || status !== "waiting_code"}
              style={{ marginBottom: 10 }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color:
                    busy || preparing || status !== "waiting_code"
                      ? ui.placeholder
                      : colors.accent,
                  fontWeight: "600",
                }}
              >
                Отправить код ещё раз
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void submitCode()}
              disabled={busy || preparing || status !== "waiting_code"}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: colors.accent,
                  opacity:
                    busy || preparing || status !== "waiting_code"
                      ? 0.45
                      : pressed
                        ? 0.9
                        : 1,
                },
              ]}
            >
              {busy && status === "waiting_code" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Продолжить</Text>
              )}
            </Pressable>
          </>
        ) : null}

        {showAuthForm && authStep === "password" ? (
          <>
            <Text style={[styles.hintSmall, { color: ui.hint, marginTop: 4 }]}>
              Пароль вводится в панели внизу — она поднимается вместе с
              клавиатурой.
            </Text>
            {passwordHint ? (
              <Text style={[styles.hintSmall, { color: ui.label, marginTop: 8 }]}>
                Подсказка Telegram: {passwordHint}
              </Text>
            ) : null}
            {hasPasswordRecoveryEmail ? (
              <Text style={[styles.hintSmall, { color: ui.hint, marginTop: 6 }]}>
                Если пароль не подходит — восстановите его в официальном Telegram
                (почта для восстановления уже привязана).
              </Text>
            ) : null}
          </>
        ) : null}

          <Pressable onPress={resetTg} style={styles.resetWrap} hitSlop={12}>
            <Text style={styles.resetText}>
              {status === "ready"
                ? "Выйти из Telegram на этом устройстве"
                : "Сбросить сессию Telegram на устройстве"}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {showAuthForm && authStep === "password" ? (
        <TelegramAuthPasswordDock
          cloudPassword={cloudPassword}
          onChangePassword={setCloudPassword}
          onSubmit={() => void submitPassword()}
          busy={busy}
          preparing={preparing}
          canSubmit={!busy && !preparing && status === "waiting_password"}
          insetsBottom={insets.bottom}
          colors={colors}
          isLight={isLight}
          ui={ui}
          inputFieldStyle={inputFieldStyle}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: 16, flexGrow: 1 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  stepTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
  subtitle: { fontSize: 15, lineHeight: 21, marginBottom: 20 },
  progressRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  progressDot: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  codeHintRow: { marginBottom: 10 },
  linkHint: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  primaryBtnSpaced: { marginTop: 4 },
  errorBanner: {
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    overflow: "hidden",
  },
  banner: { padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  bannerText: { fontSize: 14, lineHeight: 20 },
  preparingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  preparingText: { fontSize: 15, fontWeight: "500" },
  fieldLabel: { marginBottom: 8, fontSize: 14, fontWeight: "600" },
  phoneHint: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  codeDeliveryHint: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  hintSmall: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  primaryBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
  },
  secondaryBtnText: { fontWeight: "700", fontSize: 15 },
  resetWrap: { marginTop: 28 },
  resetText: { color: "#E53935", fontWeight: "600", fontSize: 15 },
});
