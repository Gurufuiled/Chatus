/**
 * Какое сообщение сейчас играет — для верхней плашки «Голосовое сообщение» с паузой.
 *
 * Раньше сообщение искали только по совпадению адреса файла с `media[0].remote_url`. После peer-first загрузки
 * пузырь проигрывает уже локальный кэш (`file://…`) или абсолютный адрес, и совпадения не находилось: плашка
 * переставала появляться. Теперь основной признак — ключ сообщения, который пузырь передаёт при запуске, а по
 * адресам совпадение проверяется по всем вариантам.
 */

export type ActiveVoiceCandidate = {
  id: string;
  msg_type: string;
  media?: ReadonlyArray<{ remote_url?: string | null }> | null;
};

export type ActiveVoiceSource = {
  /** Ключ сообщения, переданный при запуске воспроизведения. */
  key: string | null;
  /** Адрес, который играет плеер. */
  uri: string | null;
};

function normalize(uri: string | null | undefined): string {
  return (uri ?? '').trim();
}

export function findActiveVoiceMessage<T extends ActiveVoiceCandidate>(
  messages: readonly T[],
  source: ActiveVoiceSource,
  /** Приводит относительный адрес к абсолютному (как это делает пузырь). */
  resolveUrl: (uri: string) => string | null | undefined = (uri) => uri,
  /** Адрес, по которому пузырь играет сообщение без `remote_url` (`file://<id>`). */
  localFallbackUri: (message: T) => string | null | undefined = (message) => `file://${message.id}`,
): T | null {
  const key = normalize(source.key);
  const uri = normalize(source.uri);
  if (!key && !uri) return null;

  if (key) {
    const byKey = messages.find((message) => message.msg_type === 'voice' && message.id === key);
    if (byKey) return byKey;
  }
  if (!uri) return null;

  return (
    messages.find((message) => {
      if (message.msg_type !== 'voice') return false;
      const remote = normalize(message.media?.[0]?.remote_url);
      if (remote && (remote === uri || normalize(resolveUrl(remote)) === uri)) return true;
      return normalize(localFallbackUri(message)) === uri;
    }) ?? null
  );
}
