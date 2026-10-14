/**
 * Контрактный тест оформления экрана настроек (макет: лавандовый фон, белые карточки секций, плитки-иконки,
 * «Скоро» вместо бейджа). Проверяем по исходникам: экран слишком тяжёлый для юнит-рендера.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSettingsPalette } from './settingsPalette';

const settings = readFileSync(join(__dirname, 'SettingsScreen.tsx'), 'utf8');

// секции идут в порядке макета
const sections = ['Подключения', 'Приложение', 'Безопасность', 'Поддержка'];
let last = -1;
for (const title of sections) {
  const at = settings.indexOf(`<Text style={styles.sectionTitle}>${title}</Text>`);
  assert.ok(at > last, `секция «${title}» отсутствует или стоит не по порядку`);
  last = at;
}

// строки внутри секций — в порядке макета
const rowOrder = [
  "title: 'Telegram'",
  "title: 'Сервисы'",
  "title: 'Оформление'",
  "title: 'Настройки чатов'",
  "title: 'Уведомления и звуки'",
  "title: 'Язык'",
  "title: 'Данные и память'",
  "title: 'Конфиденциальность'",
  "title: 'Пароль и безопасность'",
  "title: 'Устройства'",
  "title: 'Сообщить о баге'",
  "title: 'Предложения'",
];
last = -1;
for (const row of rowOrder) {
  const at = settings.indexOf(row);
  assert.ok(at > last, `строка ${row} отсутствует или стоит не по порядку`);
  last = at;
}
assert.ok(settings.indexOf('Выйти из аккаунта') > last, 'выход стоит последним');

// нереализованные разделы помечены «Скоро» и приглушены, рабочие — нет
assert.equal((settings.match(/soon: true/g) ?? []).length, 6, 'ровно 6 разделов «Скоро»');
assert.match(settings, /Подключено|telegramConnectionMeta\.subtitle/);
assert.match(settings, /Изменить фотографию/);
assert.match(settings, /settings-hero-camera/, 'значок камеры на аватаре');

// старые подписи не вернулись
assert.doesNotMatch(settings, /Мини-приложения и ChatusFather/);
assert.doesNotMatch(settings, />Обратная связь</);

// палитры светлой и тёмной темы: лавандовый светлый фон и тёмный фон с карточками светлее фона
const light = getSettingsPalette('light');
const dark = getSettingsPalette('dark');
assert.equal(light.card, '#FFFFFF');
assert.notEqual(light.background, light.card);
assert.notEqual(dark.background, dark.card);
assert.notEqual(light.background, dark.background);
for (const key of Object.keys(light) as (keyof typeof light)[]) {
  assert.ok(dark[key] !== undefined, `в тёмной палитре нет ${key}`);
}

console.log('settingsLayout.test.ts: ok');
