.PHONY: init clean run

run:
	uv run python -m uvicorn app.main:app --reload

init:
	uv venv --python 3.12
	uv sync

clean:
	rm -rf .venv .pytest_cache .hypothesis
	find app tests -type d -name '__pycache__' -prune -exec rm -rf {} +
	find app tests -type f -name '*.pyc' -delete

