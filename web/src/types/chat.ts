import type { MappedMessage } from './message';
import type {
  EffectiveGroupPermissions,
  GroupAdminPermissions,
  GroupMemberPermissions,
} from './groupSettings';

export type ChatType = 'private' | 'group' | 'channel' | string;

export interface MappedChatMember {
  chat_id: string;
  user_id: string;
  role: string;
  access_status: string;
  subscription_expires_at: number | null;
  tag: string | null;
  tag_color: string | null;
  joined_at: number;
  /** Present for group admins when server maps adminPermissions JSON. */
  admin_permissions?: Partial<GroupAdminPermissions> | null;
  user?: {
    id: string;
    username: string | null;
    handle: string | null;
    display_name: string | null;
    avatar_url: string | null;
    phone: string | null;
    is_online: boolean;
    last_seen: number | null;
  };
}

export interface ChannelPermissions {
  can_post: boolean;
  can_manage_admins: boolean;
  can_edit_channel: boolean;
  can_moderate_subscribers: boolean;
  can_edit_channel_avatar: boolean;
  can_edit_channel_name: boolean;
  can_edit_channel_description: boolean;
  can_add_admins: boolean;
  can_remove_admins: boolean;
  can_edit_admin_permissions: boolean;
}

/** Member/default permissions for groups (from group settings API). */
export interface GroupPermissions {
  can_pin_messages?: boolean;
  can_create_polls?: boolean;
  can_send_messages?: boolean;
  can_send_media?: boolean;
  can_add_users?: boolean;
  can_change_info?: boolean;
}

export interface ChatSummary {
  id: string;
  chat_type: ChatType;
  name: string | null;
  description?: string | null;
  peer_display_name: string | null;
  avatar_url: string | null;
  created_by?: string | null;
  created_by_id?: string | null;
  invite_token?: string | null;
  slug?: string | null;
  visibility?: 'public' | 'private';
  access_type?: 'free' | 'paid';
  access_status?: 'none' | 'pending' | 'active' | 'expired' | 'canceled' | string;
  subscription_price_cents?: number | null;
  subscription_period_days?: number | null;
  subscriber_count?: number;
  allow_comments?: boolean;
  allow_reactions?: boolean;
  disable_comments_new?: boolean;
  disable_comments_new_since?: number | null;
  disable_comments_all?: boolean;
  disable_voice_comments?: boolean;
  disable_media_comments?: boolean;
  comment_cooldown_sec?: number;
  is_subscribed?: boolean;
  can_post?: boolean;
  can_view_full_feed?: boolean;
  can_comment?: boolean;
  can_react?: boolean;
  linked_discussion_chat_id?: string | null;
  channel_permissions?: Partial<ChannelPermissions>;
  /**
   * When true, non-admins cannot forward or download/save media
   * (Telegram-like "restrict saving content").
   */
  restrict_saving_content?: boolean;
  hide_members?: boolean;
  members_hidden?: boolean;
  /** Server: default rights for regular members. */
  member_permissions?: Partial<GroupMemberPermissions>;
  /** Server: effective rights for the current user. */
  my_permissions?: Partial<EffectiveGroupPermissions>;
  /** @deprecated Prefer my_permissions — kept for older client shapes/tests. */
  group_permissions?: Partial<GroupPermissions>;
  /** @deprecated Prefer member_permissions. */
  default_permissions?: Partial<GroupPermissions>;
  last_message_id: string | null;
  pinned_message_id?: string | null;
  last_message_at: number | null;
  last_message_preview: string | null;
  unread_count: number;
  is_muted: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  draft: string | null;
  created_at: number;
  updated_at: number;
  last_message?: MappedMessage;
  members?: MappedChatMember[];
}

export type { MappedMessage };
