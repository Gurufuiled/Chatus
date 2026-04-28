import { StyleSheet } from 'react-native';

import type { ThemeColors } from '../theme/palettes';
import { withAlpha } from '../theme/stylePrimitives';

export function createChatProfileMediaSectionStyles(c: ThemeColors) {
  return StyleSheet.create({
    mediaSectionCard: {
      marginTop: 10,
      backgroundColor: c.inputBackgroundSolid,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingTop: 12,
      paddingBottom: 12,
    },
    tabsRow: {
      paddingHorizontal: 12,
      paddingBottom: 6,
      gap: 8,
      alignItems: 'center',
    },
    tabButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
      height: 38,
      borderRadius: 999,
      backgroundColor: c.inputBackground,
    },
    tabButtonActive: {
      backgroundColor: withAlpha(c.accent, 0.12),
    },
    tabButtonPressed: {
      opacity: 0.8,
    },
    tabButtonText: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      color: c.textSecondary,
    },
    tabButtonTextActive: {
      color: c.accent,
    },
    tabCount: {
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: c.textSecondary,
    },
    tabCountActive: {
      color: c.accent,
    },
    mediaGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 3,
    },
    mediaTile: {
      width: '33.3333%',
      aspectRatio: 1,
      padding: 3,
    },
    mediaTilePressed: {
      opacity: 0.88,
    },
    mediaImage: {
      width: '100%',
      height: '100%',
      borderRadius: 4,
      backgroundColor: c.buttonBackground,
    },
    mediaVideoFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#222326',
    },
    mediaPlayBadge: {
      position: 'absolute',
      left: 12,
      top: 12,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15,23,42,0.62)',
    },
    mediaBadge: {
      position: 'absolute',
      right: 10,
      bottom: 10,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: 'rgba(16,24,40,0.6)',
    },
    mediaBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    stackSection: {
      paddingHorizontal: 14,
      paddingTop: 4,
      gap: 10,
    },
    fileRow: {
      minHeight: 72,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBackground,
    },
    fileRowPressed: {
      opacity: 0.82,
    },
    fileBadge: {
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.accent, 0.14),
      marginRight: 12,
    },
    fileBadgeText: {
      fontSize: 12,
      fontWeight: '800',
      color: c.accent,
    },
    fileTextWrap: {
      flex: 1,
      paddingRight: 10,
    },
    fileTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textPrimary,
    },
    fileSubtitle: {
      marginTop: 3,
      fontSize: 13,
      color: c.textSecondary,
    },
    voiceRow: {
      minHeight: 76,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBackground,
    },
    voicePlayButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
      marginRight: 12,
    },
    voicePlayButtonActive: {
      backgroundColor: c.link,
    },
    voicePlayButtonPressed: {
      opacity: 0.84,
    },
    voicePlayIcon: {
      marginLeft: 2,
    },
    voiceWaveWrap: {
      flex: 1,
    },
    voiceWaveTrack: {
      height: 24,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    voiceBar: {
      width: 3,
      borderRadius: 999,
    },
    voiceMetaRow: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    voiceDuration: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textPrimary,
    },
    voiceDate: {
      fontSize: 13,
      color: c.textSecondary,
    },
    videoNoteRowPressed: {
      opacity: 0.86,
    },
    videoNoteThumbWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      overflow: 'hidden',
      marginRight: 12,
      backgroundColor: c.buttonBackground,
    },
    videoNoteThumb: {
      width: '100%',
      height: '100%',
    },
    videoNoteThumbFallback: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.placeholderBg,
    },
    videoNoteThumbOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15,23,42,0.24)',
    },
    videoNoteTextWrap: {
      flex: 1,
    },
    videoNoteTitle: {
      marginBottom: 5,
      fontSize: 15,
      fontWeight: '700',
      color: c.textPrimary,
    },
    linkRow: {
      minHeight: 72,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.inputBackground,
    },
    linkRowPressed: {
      opacity: 0.82,
    },
    linkIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.accent, 0.12),
      marginRight: 12,
    },
    linkTextWrap: {
      flex: 1,
      paddingRight: 10,
    },
    linkTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textPrimary,
    },
    linkSubtitle: {
      marginTop: 3,
      fontSize: 13,
      color: c.textSecondary,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 46,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: c.textPrimary,
    },
    emptySubtitle: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
      color: c.textSecondary,
      textAlign: 'center',
    },
  });
}

export type ChatProfileMediaSectionStyleSet = ReturnType<
  typeof createChatProfileMediaSectionStyles
>;
