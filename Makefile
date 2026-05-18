.PHONY: help dev dev-up dev-down prod-up prod-down migrate seed test logs frontend backend worker clean

PROJECT := forgeos

help:
	@echo "ForgeOS make targets:"
	@echo "  make dev-up        Start Postgres + Redis + MinIO for local dev"
	@echo "  make dev-down      Stop the dev stack"
	@echo "  make prod-up       Start the full Docker stack (gateway + worker + frontend)"
	@echo "  make prod-down     Stop the full stack"
	@echo "  make migrate       Run Alembic migrations"
	@echo "  make backend       Run the FastAPI backend on the host"
	@echo "  make worker        Run the Arq worker on the host"
	@echo "  make frontend      Run the Vite dev server on the host"
	@echo "  make test          Smoke test the planner + executor pipeline"
	@echo "  make logs          Tail the prod stack logs"
	@echo "  make clean         Stop and remove everything (volumes too)"

dev-up:
	docker compose -f deploy/docker-compose.dev.yml -p $(PROJECT) up -d

dev-down:
	docker compose -f deploy/docker-compose.dev.yml -p $(PROJECT) down

prod-up:
	docker compose -f deploy/docker-compose.prod.yml -p $(PROJECT) up -d --build

prod-down:
	docker compose -f deploy/docker-compose.prod.yml -p $(PROJECT) down

logs:
	docker compose -f deploy/docker-compose.prod.yml -p $(PROJECT) logs -f --tail=200

migrate:
	cd backend && alembic upgrade head

backend:
	cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

worker:
	cd backend && arq app.queue.worker.WorkerSettings

frontend:
	cd frontend && npm run dev

test:
	cd backend && python -m app.scripts.smoke

clean:
	docker compose -f deploy/docker-compose.prod.yml -p $(PROJECT) down -v
	docker compose -f deploy/docker-compose.dev.yml -p $(PROJECT) down -v
