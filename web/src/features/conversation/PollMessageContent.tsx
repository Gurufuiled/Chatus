import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useComposerStore } from '@/stores/composerStore';
import { createPollMessage, fetchPoll, pollQueryKey, votePoll } from '@/services/pollService';
import { messagesQueryKey } from '@/queries/messages.queries';
import type { MappedMessage } from '@/types/message';
import type { MappedPoll, PollPayload } from '@/utils/pollPayload';
import { getPollFromMessage, mappedPollToPayload } from '@/utils/pollPayload';
import './poll.css';

function applyPollToMessage(message: MappedMessage, poll: MappedPoll): MappedMessage {
  return { ...message, poll, content: message.content ?? poll.question };
}

interface PollMessageContentProps {
  chatId: string;
  message: MappedMessage;
  disabled?: boolean;
}

export function PollMessageContent({
  chatId,
  message,
  disabled = false,
}: PollMessageContentProps) {
  const embedded = useMemo(() => getPollFromMessage(message), [message]);
  const needsFetch = message.msg_type === 'poll' && !message.poll;
  const queryClient = useQueryClient();
  const setError = useComposerStore((s) => s.setComposerError);

  const pollQuery = useQuery({
    queryKey: pollQueryKey(chatId, message.id),
    queryFn: () => fetchPoll(chatId, message.id),
    enabled: needsFetch && !disabled,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!pollQuery.data) return;
    const existing = queryClient
      .getQueryData<MappedMessage[]>(messagesQueryKey(chatId))
      ?.find((m) => m.id === message.id)?.poll;
    if (
      existing?.my_option_ids?.length &&
      (!pollQuery.data.my_option_ids || pollQuery.data.my_option_ids.length === 0)
    ) {
      return;
    }
    queryClient.setQueryData<MappedMessage[]>(messagesQueryKey(chatId), (old) =>
      old?.map((m) => (m.id === message.id ? applyPollToMessage(m, pollQuery.data!) : m)),
    );
  }, [chatId, message.id, pollQuery.data, queryClient]);

  const poll: PollPayload | null = useMemo(() => {
    // Prefer personalized query data when it has the viewer's votes.
    if (pollQuery.data?.my_option_ids?.length) {
      return mappedPollToPayload(pollQuery.data);
    }
    if (message.poll) return mappedPollToPayload(message.poll);
    if (pollQuery.data) return mappedPollToPayload(pollQuery.data);
    return embedded;
  }, [embedded, message.poll, pollQuery.data]);

  const voteMutation = useMutation({
    mutationFn: async (optionIds: string[]) => {
      return votePoll({ chatId, messageId: message.id, optionIds });
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: pollQueryKey(chatId, message.id) });
    },
    onSuccess: (result) => {
      queryClient.setQueryData(pollQueryKey(chatId, message.id), result);
      queryClient.setQueryData<MappedMessage[]>(messagesQueryKey(chatId), (old) =>
        old?.map((m) => (m.id === message.id ? applyPollToMessage(m, result) : m)),
      );
    },
    onError: (err) => {
      setError(chatId, err instanceof Error ? err.message : 'Не удалось проголосовать');
    },
  });

  if (needsFetch && pollQuery.isLoading && !poll) {
    return <p className="message-bubble__text message-bubble__text--placeholder">Загрузка опроса…</p>;
  }

  if (!poll) {
    return (
      <p className="message-bubble__text message-bubble__text--placeholder">
        {message.content?.trim() || 'Опрос'}
      </p>
    );
  }

  const hasVoted = poll.chosen_option_ids.length > 0;
  const showResults = hasVoted || poll.is_closed === true;
  const maxVotes = Math.max(1, ...poll.options.map((o) => o.voter_count));
  const allowsMultiple = poll.allows_multiple === true;

  const handleVote = (optionId: string) => {
    if (disabled || poll.is_closed || voteMutation.isPending) return;
    if (!allowsMultiple) {
      if (poll.chosen_option_ids.length === 1 && poll.chosen_option_ids[0] === optionId) {
        return;
      }
      voteMutation.mutate([optionId]);
      return;
    }
    const next = poll.chosen_option_ids.includes(optionId)
      ? poll.chosen_option_ids.filter((id) => id !== optionId)
      : [...poll.chosen_option_ids, optionId];
    if (next.length === 0) {
      setError(chatId, 'Нужен хотя бы один вариант ответа');
      return;
    }
    voteMutation.mutate(next);
  };

  return (
    <div className="poll-message">
      <p className="poll-message__question">{poll.question}</p>
      <p className="poll-message__meta">
        {poll.is_anonymous ? 'Анонимный опрос' : 'Опрос'}
        {allowsMultiple ? ' · несколько ответов' : ''}
      </p>
      <ul className="poll-message__options">
        {poll.options.map((option) => {
          const selected = poll.chosen_option_ids.includes(option.id);
          const pct =
            poll.total_voter_count > 0
              ? Math.round((option.voter_count / poll.total_voter_count) * 100)
              : 0;
          const barWidth = showResults ? Math.round((option.voter_count / maxVotes) * 100) : 0;
          const isLastSelected =
            allowsMultiple && selected && poll.chosen_option_ids.length === 1;
          return (
            <li key={option.id}>
              <button
                type="button"
                className={`poll-message__option${selected ? ' poll-message__option--selected' : ''}${showResults ? ' poll-message__option--results' : ''}`}
                disabled={disabled || poll.is_closed || voteMutation.isPending}
                title={isLastSelected ? 'Нужен хотя бы один вариант ответа' : undefined}
                onClick={() => handleVote(option.id)}
              >
                {showResults ? (
                  <span className="poll-message__bar" style={{ width: `${barWidth}%` }} aria-hidden />
                ) : null}
                <span className="poll-message__option-row">
                  <span className="poll-message__option-text">{option.text}</span>
                  {showResults ? (
                    <span className="poll-message__option-pct">{pct}%</span>
                  ) : (
                    <span className="poll-message__radio" aria-hidden />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="poll-message__footer">
        {poll.is_closed
          ? 'Опрос завершён'
          : `${poll.total_voter_count} голос${
              poll.total_voter_count === 1
                ? ''
                : poll.total_voter_count > 1 && poll.total_voter_count < 5
                  ? 'а'
                  : 'ов'
            }`}
      </p>
    </div>
  );
}

interface CreatePollDialogProps {
  open: boolean;
  chatId: string;
  canCreate: boolean;
  onClose: () => void;
}

export function CreatePollDialog({ open, chatId, canCreate, onClose }: CreatePollDialogProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [allowsMultiple, setAllowsMultiple] = useState(false);
  const setError = useComposerStore((s) => s.setComposerError);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async () => {
      const cleaned = options.map((o) => o.trim()).filter(Boolean);
      if (!question.trim() || cleaned.length < 2) {
        throw new Error('Нужны вопрос и минимум 2 варианта');
      }
      return createPollMessage({
        chatId,
        question: question.trim(),
        options: cleaned,
        isAnonymous,
        allowsMultiple,
      });
    },
    onSuccess: ({ message, poll }) => {
      const withPoll = applyPollToMessage(message, poll);
      queryClient.setQueryData(pollQueryKey(chatId, message.id), poll);
      queryClient.setQueryData<MappedMessage[]>(messagesQueryKey(chatId), (old) => {
        if (!old) return [withPoll];
        if (old.some((m) => m.id === message.id)) {
          return old.map((m) => (m.id === message.id ? withPoll : m));
        }
        return [...old, withPoll];
      });
      setQuestion('');
      setOptions(['', '']);
      setIsAnonymous(true);
      setAllowsMultiple(false);
      onClose();
    },
    onError: (err) => {
      setError(chatId, err instanceof Error ? err.message : 'Не удалось создать опрос');
    },
  });

  if (!open) return null;

  const cleanedCount = options.map((o) => o.trim()).filter(Boolean).length;
  const canSubmit =
    canCreate && question.trim().length > 0 && cleanedCount >= 2 && !createMutation.isPending;

  return (
    <div className="create-poll-dialog" role="dialog" aria-modal="true" aria-label="Новый опрос">
      <button type="button" className="create-poll-dialog__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="create-poll-dialog__panel">
        <h2 className="create-poll-dialog__title">Новый опрос</h2>
        {!canCreate ? (
          <p className="create-poll-dialog__empty">
            У вас нет права создавать опросы в этой группе.
          </p>
        ) : null}
        <label className="create-poll-dialog__field">
          <span>Вопрос</span>
          <input
            type="text"
            value={question}
            maxLength={300}
            disabled={!canCreate || createMutation.isPending}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Спросите что-нибудь"
          />
        </label>
        <div className="create-poll-dialog__options">
          <span className="create-poll-dialog__options-label">Варианты</span>
          {options.map((opt, index) => (
            <input
              key={index}
              type="text"
              value={opt}
              maxLength={100}
              disabled={!canCreate || createMutation.isPending}
              placeholder={`Вариант ${index + 1}`}
              onChange={(e) => {
                const next = [...options];
                next[index] = e.target.value;
                setOptions(next);
              }}
            />
          ))}
          {options.length < 12 ? (
            <button
              type="button"
              className="create-poll-dialog__add"
              disabled={!canCreate || createMutation.isPending}
              onClick={() => setOptions((prev) => [...prev, ''])}
            >
              + Добавить вариант
            </button>
          ) : null}
        </div>
        <label className="create-poll-dialog__anon">
          <input
            type="checkbox"
            checked={isAnonymous}
            disabled={!canCreate || createMutation.isPending}
            onChange={(e) => setIsAnonymous(e.target.checked)}
          />
          Анонимное голосование
        </label>
        <label className="create-poll-dialog__anon">
          <input
            type="checkbox"
            checked={allowsMultiple}
            disabled={!canCreate || createMutation.isPending}
            onChange={(e) => setAllowsMultiple(e.target.checked)}
          />
          Несколько ответов
        </label>
        <div className="create-poll-dialog__actions">
          <button type="button" className="create-poll-dialog__cancel" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="create-poll-dialog__submit"
            disabled={!canSubmit}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? 'Создание…' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}
