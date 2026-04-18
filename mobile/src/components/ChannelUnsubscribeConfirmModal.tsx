import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type ChannelUnsubscribeConfirmModalProps = {
  visible: boolean;
  channelName: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirmLeave: () => void;
};

/**
 * Подтверждение отписки от канала (как в референсе: заголовок, имя канала жирным, две кнопки в ряд).
 */
export function ChannelUnsubscribeConfirmModal({
  visible,
  channelName,
  busy = false,
  onCancel,
  onConfirmLeave,
}: ChannelUnsubscribeConfirmModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable style={styles.scrim} onPress={onCancel} />
        <View style={styles.sheetWrap} pointerEvents="box-none">
          <View style={styles.card}>
            <Text style={styles.title}>Отписка от канала</Text>
            <Text style={styles.body}>
              Вы точно хотите покинуть канал{' '}
              <Text style={styles.channelNameBold}>{channelName}</Text>?
            </Text>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onConfirmLeave}
                style={({ pressed }) => [
                  styles.btnDanger,
                  pressed && !busy && styles.btnPressed,
                  busy && styles.btnBusy,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.btnDangerLabel}>Покинуть</Text>
                )}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onCancel}
                style={({ pressed }) => [styles.btnCancel, pressed && !busy && styles.btnPressed]}
              >
                <Text style={styles.btnCancelLabel}>Отмена</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 10,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    color: '#111827',
    marginBottom: 20,
  },
  channelNameBold: {
    fontWeight: '800',
    color: '#111827',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  btnDanger: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
  },
  btnCancel: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5865F2',
  },
  btnPressed: {
    opacity: 0.88,
  },
  btnBusy: {
    opacity: 0.92,
  },
  btnDangerLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnCancelLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
