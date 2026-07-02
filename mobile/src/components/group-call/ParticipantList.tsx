import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import type { GroupCallParticipant } from '../../contexts/GroupCallContext';
import { ParticipantRow } from './ParticipantRow';

type ParticipantListProps = {
  participants: GroupCallParticipant[];
};

export function ParticipantList({ participants }: ParticipantListProps) {
  return (
    <ScrollView
      style={styles.list}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {participants.map((participant) => (
        <ParticipantRow key={participant.userId} participant={participant} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    width: '100%',
  },
  content: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
});
