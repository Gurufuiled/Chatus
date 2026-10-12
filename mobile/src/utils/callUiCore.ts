/**
 * Чистая логика интерфейса звонка 1-на-1: тексты статуса, длительность, раскладка кнопок.
 * Без импортов react-native — покрыта тестами в `callUiCore.test.ts`.
 */

export type CallPhase = 'incoming' | 'outgoing' | 'connecting' | 'active';
export type CallKind = 'audio' | 'video';

export type CallControlsLayout = {
  screenHorizontalPadding: number;
  rowGap: number;
  incomingGap: number;
  incomingPaddingHorizontal: number;
  buttonGap: number;
  circleSize: number;
  prominentCircleSize: number;
  iconSize: number;
  prominentIconSize: number;
  labelFontSize: number;
};

/** «М:СС» с начала звонка; пока время начала неизвестно — «Соединение установлено». */
export function formatCallDuration(startedAt?: number, now = Date.now()): string {
  if (!startedAt) return 'Соединение установлено';
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function buildInitial(name: string): string {
  return (name.trim()[0] || '?').toUpperCase();
}

export function getStatusText(
  callState: { phase: CallPhase; startedAt?: number } | null,
  nowTick: number,
): string {
  if (!callState) return '';

  switch (callState.phase) {
    case 'incoming':
      return 'Входящий звонок';
    case 'outgoing':
      return 'Вызываем...';
    case 'connecting':
      return 'Соединяем...';
    case 'active':
      return formatCallDuration(callState.startedAt, nowTick);
    default:
      return '';
  }
}

export function getPhaseCaption(
  callState: { phase: CallPhase; callKind: CallKind } | null,
): string {
  const phase = callState?.phase;
  const isVideo = callState?.callKind === 'video';

  switch (phase) {
    case 'incoming':
      return isVideo ? 'Видеозвонок' : 'Голосовой звонок';
    case 'outgoing':
      return isVideo ? 'Ожидаем ответа на видео' : 'Ожидаем ответа';
    case 'connecting':
      return isVideo ? 'Подключаем видео' : 'Подключаем аудио';
    case 'active':
      return isVideo ? 'Видеозвонок' : 'Голосовой разговор';
    default:
      return '';
  }
}

/** Всё, кроме явного `video`, считаем аудиозвонком (старые клиенты `call_type` не присылают). */
export function getCallKindFromOffer(callType: CallKind | undefined): CallKind {
  return callType === 'video' ? 'video' : 'audio';
}

export function buildOfferOptions(shouldReceiveVideo: boolean) {
  return {
    offerToReceiveAudio: true,
    offerToReceiveVideo: shouldReceiveVideo,
  };
}

export function getCallControlsLayout(screenWidth: number): CallControlsLayout {
  if (screenWidth <= 340) {
    return {
      screenHorizontalPadding: 14,
      rowGap: 4,
      incomingGap: 18,
      incomingPaddingHorizontal: 6,
      buttonGap: 7,
      circleSize: 50,
      prominentCircleSize: 58,
      iconSize: 20,
      prominentIconSize: 24,
      labelFontSize: 11,
    };
  }

  if (screenWidth <= 380) {
    return {
      screenHorizontalPadding: 18,
      rowGap: 6,
      incomingGap: 22,
      incomingPaddingHorizontal: 8,
      buttonGap: 8,
      circleSize: 58,
      prominentCircleSize: 66,
      iconSize: 22,
      prominentIconSize: 26,
      labelFontSize: 12,
    };
  }

  return {
    screenHorizontalPadding: 24,
    rowGap: 8,
    incomingGap: 28,
    incomingPaddingHorizontal: 12,
    buttonGap: 10,
    circleSize: 68,
    prominentCircleSize: 78,
    iconSize: 24,
    prominentIconSize: 28,
    labelFontSize: 13,
  };
}
