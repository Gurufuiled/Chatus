import React, { useCallback, useMemo, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { ChatsStackParamList } from "../navigation/types";
import { useTheme } from "../contexts/ThemeContext";
import {
  telegramAccountStore,
  type TelegramDialogRow,
} from "../stores/telegramAccountStore";
import { ChatListSearchBar } from "../components/ChatListSearchBar";
import { TelegramDialogListRow } from "../components/TelegramDialogListRow";
import { createChatListStyles } from "./chatList.styles";
import { matchesDialogQuery } from "./telegramChat/telegramDialogsLoader";
import { useTelegramDialogsRefresh } from "./telegramChat/useTelegramDialogsRefresh";

export function TelegramDialogsScreen() {
  const { colors } = useTheme();
  const listStyles = useMemo(() => createChatListStyles(colors), [colors]);
  const navigation =
    useNavigation<NativeStackNavigationProp<ChatsStackParamList>>();
  const dialogs = telegramAccountStore((s) => s.dialogs);
  const telegramReady = telegramAccountStore((s) => s.authStatus === "ready");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = React.useState(false);

  const refresh = useTelegramDialogsRefresh(telegramReady);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const lastError = telegramAccountStore((s) => s.lastError);

  const normalizedQuery = query.trim().toLowerCase();
  const isSearchActive = normalizedQuery.length > 0;
  const filteredDialogs = useMemo(() => {
    if (!isSearchActive) return dialogs;
    return dialogs.filter((row) => matchesDialogQuery(row, normalizedQuery));
  }, [dialogs, isSearchActive, normalizedQuery]);

  const renderItem = useCallback(
    ({ item }: { item: TelegramDialogRow }) => (
      <TelegramDialogListRow item={item} navigation={navigation} />
    ),
    [navigation],
  );

  const empty = useMemo(
    () => (
      <View style={listStyles.empty}>
        {lastError && !isSearchActive ? (
          <Text
            style={{ color: "#E53935", textAlign: "center", marginBottom: 12 }}
          >
            {lastError}
          </Text>
        ) : null}
        <Text style={listStyles.emptyText}>
          {isSearchActive
            ? "Ничего не найдено"
            : "Список чатов пуст. Если аккаунт только что подключили, подождите синхронизацию и потяните список вниз для обновления."}
        </Text>
      </View>
    ),
    [isSearchActive, lastError, listStyles.empty, listStyles.emptyText],
  );

  // ⚡ Bolt: Memoize ItemSeparatorComponent to prevent FlatList from treating it
  // as a new component type on every render.
  // Impact: Prevents all separators from unmounting and remounting during scroll.
  const renderSeparator = React.useCallback(
    () => <View style={listStyles.separator} />,
    [listStyles.separator],
  );

  return (
    <View style={listStyles.container}>
      <FlatList
        data={filteredDialogs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={renderSeparator}
        ListHeaderComponent={
          <ChatListSearchBar
            listStyles={listStyles}
            iconColor={colors.textSecondary}
            placeholderColor={colors.placeholder}
            accentColor={colors.accent}
            placeholder="Поиск чатов и контактов"
            value={query}
            onChangeText={setQuery}
          />
        }
        ListEmptyComponent={empty}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accent}
          />
        }
      />
    </View>
  );
}
