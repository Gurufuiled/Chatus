/**
 * Контрактный тест экрана настроек: он рисуется сразу из локальной сессии, а профиль обновляется в фоне и не чаще
 * раза в 30 с. Раньше экран висел на спиннере, пока шёл запрос (до 15 с таймаута), и в итоге показывал ошибку
 * про «телефон и ПК в одной сети». Проверяем по исходникам: экран слишком тяжёлый для юнит-рендера.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const settings = readFileSync(join(__dirname, 'SettingsScreen.tsx'), 'utf8');
const apiClient = readFileSync(join(__dirname, '..', 'services', 'apiClient.ts'), 'utf8');

// профиль стартует из локального пользователя, спиннер — только если пользователя нет
assert.match(settings, /useState<[\s\S]*?>\(\(\) =>\s*\/\/[^\n]*\n\s*user\s*\?/, 'профиль не берётся из локальной сессии');
assert.match(settings, /useState\(\(\) => !user\)/, 'спиннер на весь экран должен быть только без локального пользователя');

// загрузка не включает спиннер заново
{
  const start = settings.indexOf('const loadProfile = useCallback(');
  const body = settings.slice(start, settings.indexOf('useFocusEffect(', start));
  assert.doesNotMatch(body, /setLoading\(true\)/, 'loadProfile снова блокирует экран спиннером');
  assert.match(body, /friendlyApiError\(/, 'ошибка загрузки должна быть человеческой');
}

// не перезапрашиваем при каждом входе на экран
assert.match(settings, /PROFILE_REFRESH_MIN_INTERVAL_MS = 30_000/);
assert.match(settings, /Date\.now\(\) - lastLoadedAtRef\.current < PROFILE_REFRESH_MIN_INTERVAL_MS/);
// после ошибки следующий вход пробует снова
assert.match(settings, /lastLoadedAtRef\.current = 0;/);

// сообщение таймаута в релизе без подсказки для разработчика
assert.match(apiClient, /serverTimeoutMessage\(API_BASE_URL, __DEV__\)/);
assert.doesNotMatch(apiClient, /телефон и ПК в одной сети/, 'подсказка для разработчика вернулась в apiClient');

console.log('settingsLoadingWiring.test.ts: ok');
