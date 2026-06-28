import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CommonActions } from "@react-navigation/native";
import {
  listMiniApps,
  openChatusFatherChat,
  type MiniAppSummary,
} from "../services/miniAppsService";
import { resolveAvatarUrl } from "../config";
import { useTheme } from "../contexts/ThemeContext";
import { createServicesScreenStyles } from "./servicesScreen.styles";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Services">;

export function ServicesScreen({ navigation }: Props) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(
    () => createServicesScreenStyles(themeColors),
    [themeColors],
  );
  const [apps, setApps] = useState<MiniAppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const list = await listMiniApps();
      setApps(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить сервисы");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(false);
  }, [load]);

  const openApp = useCallback(
    (app: MiniAppSummary) => {
      navigation.navigate("MiniApp", { appId: app.short_id, title: app.title });
    },
    [navigation],
  );

  const openChatusFather = useCallback(async () => {
    try {
      const { chat } = await openChatusFatherChat();
      navigation.dispatch(
        CommonActions.navigate({
          name: "Chats",
          params: {
            screen: "Chat",
            params: { chatId: chat.id, chatTitle: "ChatusFather" },
          },
        }),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось открыть ChatusFather",
      );
    }
  }, [navigation]);

  // Optimization: Memoize the FlatList key extractor to provide a stable reference,
  // preventing unnecessary React re-renders of the list item wrappers.
  const keyExtractor = useCallback((item: MiniAppSummary) => item.id, []);

  // Optimization: Memoize the list header to prevent it from unmounting and
  // remounting on every parent render when unrelated state changes.
  const listHeaderComponent = useMemo(
    () => (
      <View>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <Pressable
          style={({ pressed }) => [
            styles.fatherCard,
            pressed && styles.pressed,
          ]}
          onPress={openChatusFather}
        >
          <View style={styles.fatherIcon}>
            <Text style={styles.fatherIconText}>CF</Text>
          </View>
          <View style={styles.fatherText}>
            <Text style={styles.fatherTitle}>@ChatusFather</Text>
            <Text style={styles.fatherSubtitle}>
              Зарегистрировать мини-приложение, /newapp, /myapps
            </Text>
          </View>
        </Pressable>

        <Text style={styles.sectionTitle}>Опубликованные приложения</Text>
      </View>
    ),
    [error, styles, openChatusFather],
  );

  // Optimization: Memoize the empty state component to avoid recreation during renders.
  const listEmptyComponent = useMemo(
    () => (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Пока нет мини-приложений</Text>
        <Text style={styles.emptySubtitle}>
          Разработчики могут опубликовать своё приложение через @ChatusFather.
        </Text>
      </View>
    ),
    [styles],
  );

  // Optimization: Memoize the renderItem function.
  // Passing an inline function to `renderItem` forces React to create a new component
  // type on every render. Memoizing it with `useCallback` ensures a stable reference,
  // which significantly improves FlatList scrolling performance and reduces memory usage.
  const renderItem = useCallback(
    ({ item }: { item: MiniAppSummary }) => (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        onPress={() => openApp(item)}
      >
        <View style={styles.icon}>
          {item.icon_url ? (
            <Image
              source={{ uri: resolveAvatarUrl(item.icon_url) ?? item.icon_url }}
              style={styles.iconImage}
              contentFit="cover"
              cachePolicy="disk"
            />
          ) : (
            <Text style={styles.iconPlaceholder}>
              {(item.title[0] ?? "?").toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.title}
          </Text>
          {item.description ? (
            <Text style={styles.rowSubtitle} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
        </View>
      </Pressable>
    ),
    [styles, openApp],
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.listContent}
      data={apps}
      keyExtractor={keyExtractor}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListHeaderComponent={listHeaderComponent}
      ListEmptyComponent={listEmptyComponent}
      renderItem={renderItem}
    />
  );
}
