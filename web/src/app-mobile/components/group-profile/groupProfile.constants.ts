export type GroupMemberTagColor = 'blue' | 'green' | 'orange' | 'red';

export type GroupMemberTagOption = {
  key: GroupMemberTagColor;
  fill: string;
  bubble: string;
  text: string;
};

export const DEFAULT_MEMBER_TAG_COLOR: GroupMemberTagColor = 'blue';

export const GROUP_MEMBER_TAG_OPTIONS: GroupMemberTagOption[] = [
  { key: 'blue', fill: '#5B8DEF', bubble: 'rgba(91, 141, 239, 0.16)', text: '#4C7FE5' },
  { key: 'green', fill: '#54B173', bubble: 'rgba(84, 177, 115, 0.16)', text: '#3F9960' },
  { key: 'orange', fill: '#F39A4A', bubble: 'rgba(243, 154, 74, 0.18)', text: '#D8822D' },
  { key: 'red', fill: '#E66C7A', bubble: 'rgba(230, 108, 122, 0.18)', text: '#CC5563' },
];

export function isGroupMemberTagColor(value?: string | null): value is GroupMemberTagColor {
  return GROUP_MEMBER_TAG_OPTIONS.some((option) => option.key === value);
}

export function getGroupMemberTagOption(color?: string | null) {
  return (
    GROUP_MEMBER_TAG_OPTIONS.find((option) => option.key === color) ??
    GROUP_MEMBER_TAG_OPTIONS[0]
  );
}
