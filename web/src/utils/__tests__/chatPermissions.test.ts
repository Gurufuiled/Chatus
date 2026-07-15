import { describe, expect, it } from 'vitest';
import type { ChatSummary } from '@/types/chat';
import {
  canCreatePolls,
  canPinMessages,
  canSaveOrForwardContent,
  isRestrictSavingContent,
} from '@/utils/chatPermissions';

function makeChat(overrides: Partial<ChatSummary> = {}): ChatSummary {
  return {
    id: 'chat-1',
    chat_type: 'group',
    name: 'Group',
    peer_display_name: null,
    avatar_url: null,
    last_message_id: null,
    last_message_at: null,
    last_message_preview: null,
    unread_count: 0,
    is_muted: false,
    is_pinned: false,
    is_archived: false,
    draft: null,
    created_at: 0,
    updated_at: 0,
    members: [
      {
        chat_id: 'chat-1',
        user_id: 'user-1',
        role: 'member',
        access_status: 'active',
        subscription_expires_at: null,
        tag: null,
        tag_color: null,
        joined_at: 0,
      },
    ],
    ...overrides,
  };
}

describe('chatPermissions', () => {
  it('blocks forward/save for non-admins when restrict_saving_content is set', () => {
    const chat = makeChat({
      restrict_saving_content: true,
      my_permissions: { can_restrict_saving_bypass: false },
    });
    expect(isRestrictSavingContent(chat)).toBe(true);
    expect(canSaveOrForwardContent(chat, { id: 'user-1' })).toBe(false);
    expect(
      canSaveOrForwardContent(
        makeChat({
          restrict_saving_content: true,
          my_permissions: { can_restrict_saving_bypass: true },
        }),
        { id: 'user-1' },
      ),
    ).toBe(true);
    expect(
      canSaveOrForwardContent(
        makeChat({
          restrict_saving_content: true,
          members: [
            {
              chat_id: 'chat-1',
              user_id: 'user-1',
              role: 'admin',
              access_status: 'active',
              subscription_expires_at: null,
              tag: null,
              tag_color: null,
              joined_at: 0,
            },
          ],
        }),
        { id: 'user-1' },
      ),
    ).toBe(true);
  });

  it('allows pin for admins and when can_pin_messages is true', () => {
    expect(canPinMessages(makeChat({ chat_type: 'private' }), { id: 'user-1' })).toBe(true);
    expect(
      canPinMessages(
        makeChat({ my_permissions: { can_pin_messages: false } }),
        { id: 'user-1' },
      ),
    ).toBe(false);
    expect(
      canPinMessages(
        makeChat({ my_permissions: { can_pin_messages: true } }),
        { id: 'user-1' },
      ),
    ).toBe(true);
    // Absent flags on groups → deny for members; admins still can
    expect(canPinMessages(makeChat({}), { id: 'user-1' })).toBe(false);
    expect(
      canPinMessages(
        makeChat({
          members: [
            {
              chat_id: 'chat-1',
              user_id: 'user-1',
              role: 'owner',
              access_status: 'active',
              subscription_expires_at: null,
              tag: null,
              tag_color: null,
              joined_at: 0,
            },
          ],
        }),
        { id: 'user-1' },
      ),
    ).toBe(true);
  });

  it('gates create polls by permission (groups only)', () => {
    expect(canCreatePolls(makeChat({ chat_type: 'private' }), { id: 'user-1' })).toBe(false);
    expect(
      canCreatePolls(
        makeChat({ my_permissions: { can_create_polls: false } }),
        { id: 'user-1' },
      ),
    ).toBe(false);
    expect(
      canCreatePolls(
        makeChat({ my_permissions: { can_create_polls: true } }),
        { id: 'user-1' },
      ),
    ).toBe(true);
    // Absent → allow (server member default true)
    expect(canCreatePolls(makeChat({}), { id: 'user-1' })).toBe(true);
  });
});
