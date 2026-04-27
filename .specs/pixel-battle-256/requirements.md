# Requirements Document

## Introduction

Pixel Battle в этом проекте — это общая онлайн-доска 256x256, где игроки в реальном времени перекрашивают пиксели. Ключевое правило: каждый игрок может успешно поставить только один пиксель раз в 10 секунд. Решение должно быть совместимо с Next.js App Router для веб-интерфейса и поддерживать масштабирование по числу одновременных пользователей.

## Requirements

### Requirement 1 – Глобальное полотно 256x256

**User Story:** Как игрок, я хочу видеть единое полотно 256x256, чтобы сразу взаимодействовать с общей картиной вместе с другими игроками.

#### Acceptance Criteria

1. WHEN the player opens the main Pixel Battle screen THEN the system SHALL render a canvas with exactly 256 columns and 256 rows.
2. IF a requested pixel coordinate is outside the 0..255 range for X or Y THEN the system SHALL reject the operation with a validation error.
3. WHEN the player hovers or taps a cell THEN the system SHALL display its exact X and Y coordinates.
4. IF a cell has no prior color state THEN the system SHALL display the default background color for that cell.

### Requirement 2 – Установка пикселя с cooldown 10 секунд

**User Story:** Как игрок, я хочу ставить пиксель одним действием, чтобы участвовать в игре с понятным ограничением по времени.

#### Acceptance Criteria

1. WHEN the player submits a valid pixel placement THEN the system SHALL persist the new color for that coordinate.
2. IF fewer than 10 seconds have passed since the player's last successful placement THEN the system SHALL reject the request and return remaining cooldown seconds.
3. WHEN at least 10 seconds have passed since the player's last successful placement THEN the system SHALL accept the next valid placement request.
4. IF the request contains an unsupported color value THEN the system SHALL reject the request with a validation error.

### Requirement 3 – Реалтайм-обновления для всех подключенных игроков

**User Story:** Как игрок, я хочу видеть изменения пикселей от других игроков почти мгновенно, чтобы ощущать живое общее взаимодействие.

#### Acceptance Criteria

1. WHEN the server accepts a pixel placement THEN the system SHALL broadcast the update to all relevant connected clients in real time.
2. IF a player reconnects after connection loss THEN the system SHALL deliver a consistent current board state before new live updates.
3. WHEN multiple accepted updates target the same coordinate THEN the system SHALL apply a deterministic last-write-wins rule based on server ordering.
4. IF live delivery to a client fails temporarily THEN the system SHALL allow that client to resynchronize board state on reconnect.

### Requirement 4 – Идентификация игрока и базовая защита от злоупотреблений

**User Story:** Как владелец продукта, я хочу идентифицировать действия игрока, чтобы корректно применять cooldown и снижать массовые злоупотребления.

#### Acceptance Criteria

1. WHEN a player sends a placement request THEN the system SHALL bind the request to a stable player identifier.
2. IF a placement request has no valid player identifier THEN the system SHALL reject the request as unauthorized.
3. WHEN repeated abusive request patterns are detected for one identifier or IP THEN the system SHALL apply rate limiting.
4. IF a placement request is rejected by rate limiting THEN the system SHALL return a machine-readable error reason.

### Requirement 5 – Базовая операционная надежность

**User Story:** Как владелец продукта, я хочу иметь базовую наблюдаемость, чтобы понимать состояние игры и быстро реагировать на проблемы.

#### Acceptance Criteria

1. WHEN a placement request is processed THEN the system SHALL write a structured event log with player ID, coordinates, color, and result.
2. IF the placement processing path returns an internal error THEN the system SHALL return a generic safe error to the client without exposing internals.
3. WHEN board state snapshots are generated THEN the system SHALL store them in a format suitable for fast restore on client reconnect.
4. IF snapshot restore fails THEN the system SHALL return an explicit recoverable error and keep service health reporting active.

## Global Assumptions

- Игрок может быть анонимным, но для него создается устойчивый идентификатор сессии или аккаунта.
- Для стартового релиза палитра цветов ограничена заранее заданным набором.
- Next.js используется как веб-слой и API-слой, при этом realtime-подсистема может быть вынесена в отдельный процесс при масштабировании.
