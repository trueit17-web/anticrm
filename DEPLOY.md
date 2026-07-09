# Развёртывание на сервере (production)

## 1. Требования к серверу

- Ubuntu Server 22.04/24.04 LTS, 2+ vCPU, 4+ ГБ RAM, 40+ ГБ SSD (см. рекомендации в чате — 4 vCPU/8 ГБ с запасом на рост).
- Домен, A-записью указывающий на IP сервера (нужен для HTTPS).
- Открытые порты 80 и 443 (443 — обязательно наружу, 80 — для ACME-проверки и редиректа).

## 2. Установка Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# перелогиньтесь, чтобы группа docker применилась
```

## 3. Копирование проекта на сервер

```bash
git clone <ваш-репозиторий> crm && cd crm
# либо просто скопируйте директорию проекта через scp/rsync
```

## 4. Настройка переменных окружения

```bash
cp .env.production.example .env
nano .env
```

Обязательно замените:
- `POSTGRES_PASSWORD`, `SEED_ADMIN_PASSWORD` — сгенерируйте: `openssl rand -base64 24`
- `JWT_SECRET` — сгенерируйте: `openssl rand -base64 48`
- `DOMAIN` — ваш реальный домен (A-запись уже должна на него указывать)
- `LETSENCRYPT_EMAIL` — для уведомлений об истечении сертификата

## 5. Получение HTTPS-сертификата (один раз)

```bash
chmod +x deploy/init-letsencrypt.sh scripts/*.sh
./deploy/init-letsencrypt.sh
```

Скрипт поднимет nginx с временным сертификатом, получит настоящий от Let's Encrypt и перезагрузит nginx. Контейнер `certbot` из `docker-compose.prod.yml` дальше сам продлевает сертификат каждые 12 часов (когда до истечения <30 дней).

## 6. Запуск всего стека

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f backend
```

При первом запуске backend применит миграции Prisma и создаст администратора из `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD`. **Смените этот пароль сразу после первого входа.**

Если нужны несколько филиалов: раскомментируйте `SEED_SUPERADMIN_USERNAME` / `SEED_SUPERADMIN_PASSWORD` в `.env` до первого запуска — так же создастся суперадминистратор (видит и создаёт филиалы, назначает первого админа каждому). Обычные администраторы такую роль назначить не могут — это единственный способ завести первого суперадминистратора.

Откройте `https://<ваш-домен>` — должна открыться страница входа.

## 7. Бэкапы базы данных

```bash
crontab -e
```
Добавьте (ежедневный бэкап в 03:00, хранить 14 дней):
```
0 3 * * * /path/to/crm/scripts/backup-db.sh >> /var/log/crm-backup.log 2>&1
```

Восстановление из бэкапа: `scripts/restore-db.sh backups/crm_<дата>.sql.gz`.

## 8. Обновление после изменений в коде

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Контейнеры без простоя не гарантируются (кратковременный рестарт backend/frontend), но БД и её том не трогаются.

## 9. Что уже учтено в конфигурации

- `db` и `backend` не публикуют порты наружу — доступны только внутри docker-сети.
- Frontend отдаёт статику и проксирует `/api/*` на backend через nginx — CORS не нужен, всё на одном домене.
- Секреты (`JWT_SECRET`, пароли) берутся только из `.env`, которого нет в git (см. `.gitignore`).
- Автопродление сертификата, security-заголовки (`X-Frame-Options`, `X-Content-Type-Options`), редирект HTTP→HTTPS.

## 10. Чего в этой конфигурации нет (сделать по мере роста)

- Централизованные логи/мониторинг (например, добавить Prometheus/Grafana или внешний сервис).
- Rate limiting на `/api/auth/login` (защита от подбора пароля) — стоит добавить в nginx (`limit_req`) при выходе в публичный доступ.
- Горизонтальное масштабирование backend (сейчас один контейнер).
