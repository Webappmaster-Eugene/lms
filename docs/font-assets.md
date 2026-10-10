# Шрифты приложения

Inter размещён в public/fonts/inter под SIL Open Font License 1.1.
OFL.txt сохраняет лицензию и copyright; источник — Google Fonts / Inter Project.
Файлы скопированы без изменения из успешно собранного next/font/google;
сохранены все семь Unicode subsets, диапазоны весов и метрики fallback.
CSS: src/app/fonts.css. Предзагружаются только кириллица и латиница.
Сборка не обращается к Google Fonts. Публичный middleware разрешает только
конкретные файлы; имена содержат прежний hash содержимого, HTTP кеш — immutable.
При обновлении шрифта меняются файл/hash, PUBLIC_FONT_PATHS и предзагрузка.
Не заменяйте содержимое под прежним URL, поскольку браузер кеширует его на год.

Источник лицензии: https://raw.githubusercontent.com/google/fonts/main/ofl/inter/OFL.txt
