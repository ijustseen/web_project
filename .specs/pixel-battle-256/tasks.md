# Implementation Plan

- [x] 1. Создать доменные типы и константы Pixel Battle 256x256
  - Добавить файл types/pixel.ts с типами запроса, результата и палитры.
  - Добавить файл services/pixel/constants.ts с BOARD_SIZE=256 и COOLDOWN_SECONDS=10.
  - Добавить минимальные unit tests на корректность экспортируемых констант и допустимых цветов.
  - Lint policy: запрещено ослаблять правила линтера, включая as unknown, any там где запрещено, и любые eslint disable комментарии.
  - Перед завершением шага выполнить npm run lint:fix и npm run cs:fix.
  - Requirements: R1.AC1, R2.AC4.

- [x] 2. Реализовать валидацию координат и цвета
  - Добавить файл services/pixel/validation.ts с функциями validateCoordinates и validateColor.
  - Покрыть тестами позитивные и негативные сценарии диапазона 0..255 и неподдерживаемых цветов.
  - Убедиться, что ошибки валидации возвращают машиночитаемые коды для API слоя.
  - Lint policy: запрещено ослаблять правила линтера, включая as unknown, any там где запрещено, и любые eslint disable комментарии.
  - Перед завершением шага выполнить npm run lint:fix и npm run cs:fix.
  - Requirements: R1.AC2, R2.AC4.

- [x] 3. Реализовать in-memory store с правилом cooldown 10 секунд
  - Добавить файл services/pixel/store.ts с хранением доски 256x256 и cooldown по playerId.
  - Реализовать applyPlacement с серверной проверкой интервала 10 секунд между успешными установками.
  - Добавить unit tests для успешной установки, отказа по cooldown и повторного успеха после истечения таймера.
  - Lint policy: запрещено ослаблять правила линтера, включая as unknown, any там где запрещено, и любые eslint disable комментарии.
  - Перед завершением шага выполнить npm run lint:fix и npm run cs:fix.
  - Requirements: R2.AC1, R2.AC2, R2.AC3.

- [x] 4. Реализовать идентификацию игрока в API запросах
  - Добавить файл services/pixel/player-id.ts для чтения playerId из cookie или заголовка.
  - Внедрить единый формат ошибки unauthorized при отсутствии идентификатора.
  - Добавить unit tests на наличие и отсутствие playerId.
  - Lint policy: запрещено ослаблять правила линтера, включая as unknown, any там где запрещено, и любые eslint disable комментарии.
  - Перед завершением шага выполнить npm run lint:fix и npm run cs:fix.
  - Requirements: R4.AC1, R4.AC2.

- [x] 5. Добавить Route Handler для чтения состояния доски
  - Создать файл app/api/pixels/board/route.ts с GET-обработчиком текущего состояния доски.
  - Вернуть структуру ответа, достаточную для инициализации клиента.
  - Добавить integration tests на корректный ответ 200 и структуру payload.
  - Lint policy: запрещено ослаблять правила линтера, включая as unknown, any там где запрещено, и любые eslint disable комментарии.
  - Перед завершением шага выполнить npm run lint:fix и npm run cs:fix.
  - Requirements: R1.AC1, R3.AC2.

- [x] 6. Добавить Route Handler для установки пикселя
  - Создать файл app/api/pixels/place/route.ts с POST-обработчиком установки пикселя.
  - Подключить проверку playerId, валидацию payload и вызов applyPlacement.
  - Обеспечить статусы 200, 400, 401 и 429 с машиночитаемыми кодами ошибок.
  - Добавить integration tests на успех и все основные ветки отказа.
  - Lint policy: запрещено ослаблять правила линтера, включая as unknown, any там где запрещено, и любые eslint disable комментарии.
  - Перед завершением шага выполнить npm run lint:fix и npm run cs:fix.
  - Requirements: R2.AC1, R2.AC2, R2.AC3, R4.AC2, R4.AC4.

- [x] 7. Обновить UI главной страницы под Pixel Battle
  - Модифицировать app/page.tsx для отображения полотна 256x256, выбора цвета и кнопки установки.
  - Модифицировать app/page.module.scss для адаптивного layout и состояний элементов управления.
  - Добавить отображение координат клетки и countdown до следующей установки.
  - Добавить UI tests для рендера сетки и состояния блокировки действия во время cooldown.
  - Lint policy: запрещено ослаблять правила линтера, включая as unknown, any там где запрещено, и любые eslint disable комментарии.
  - Перед завершением шага выполнить npm run lint:fix и npm run cs:fix.
  - Requirements: R1.AC1, R1.AC3, R2.AC2, R2.AC3.

- [x] 8. Добавить базовую наблюдаемость и защиту от злоупотреблений
  - Добавить structured logging результата каждой попытки установки пикселя.
  - Добавить rate limiting по playerId и IP в обработчике установки.
  - Добавить integration tests на ограничение частоты и корректный error code.
  - Lint policy: запрещено ослаблять правила линтера, включая as unknown, any там где запрещено, и любые eslint disable комментарии.
  - Перед завершением шага выполнить npm run lint:fix и npm run cs:fix.
  - Requirements: R4.AC3, R4.AC4, R5.AC1, R5.AC2.
