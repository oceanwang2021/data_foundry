.PHONY: init run test clean

PORT ?= 8100

run:
	uv run python -m uvicorn app.main:app --reload --host 0.0.0.0 --port $(PORT)

init:
	uv venv --python 3.12
	uv sync

test:
	uv run python -m pytest tests

clean:
	rm -rf .venv .pytest_cache .hypothesis
	find app tests -type d -name '__pycache__' -prune -exec rm -rf {} +
	find app tests -type f -name '*.pyc' -delete
