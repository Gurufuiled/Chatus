import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = { children: ReactNode };

type State = { error: Error | null };

/**
 * Показывает текст ошибки на экране (RedBox иногда не виден в симуляторе / при нативных сбоях рядом).
 */
export class BootstrapErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[BootstrapErrorBoundary]', error.message, error.stack, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <View style={styles.root}>
        <Text style={styles.title}>Ошибка в приложении</Text>
        <Text style={styles.subtitle}>Скопируй текст ниже — так проще отладить.</Text>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text selectable style={styles.message}>
            {error.message}
          </Text>
          {error.stack ? (
            <Text selectable style={styles.stack}>
              {error.stack}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#c00', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  message: { fontSize: 16, color: '#111', marginBottom: 16 },
  stack: { fontSize: 12, fontFamily: 'Menlo', color: '#333' },
});
