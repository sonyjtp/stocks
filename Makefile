.PHONY: help install test lint format clean coverage pre-commit

help:
	@echo "Stock Trading Tracker - Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install          Install all dependencies"
	@echo ""
	@echo "Testing:"
	@echo "  make test             Run all tests"
	@echo "  make coverage         Run tests with coverage report"
	@echo "  make test-watch       Run tests in watch mode"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint             Run all linters"
	@echo "  make format           Format code with black and isort"
	@echo "  make black            Format with black only"
	@echo "  make isort            Sort imports with isort"
	@echo "  make flake8           Run flake8 linter"
	@echo "  make bandit           Run security checks"
	@echo ""
	@echo "Git Hooks:"
	@echo "  make pre-commit       Install pre-commit hooks"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean            Remove test artifacts and cache"

install:
	pip install -r requirements.txt
	pip install -r requirements-dev.txt

test:
	pytest backend/tests -v

coverage:
	pytest backend/tests -v --cov=backend/app --cov-report=html --cov-report=term-missing
	@echo "✓ Coverage report: htmlcov/index.html"

test-watch:
	pytest-watch backend/tests

lint: black flake8 isort bandit
	@echo "✓ All linting checks passed"

format: black isort
	@echo "✓ Code formatted"

black:
	black backend/app --line-length=100
	@echo "✓ Black formatting complete"

isort:
	isort backend/app --profile=black --line-length=100
	@echo "✓ isort import sorting complete"

flake8:
	flake8 backend/app --max-line-length=100 --extend-ignore=E203,W503
	@echo "✓ flake8 linting passed"

bandit:
	bandit -r backend/app -c .bandit
	@echo "✓ bandit security scan passed"

pre-commit:
	pre-commit install
	pre-commit install --hook-type pre-push
	@echo "✓ Pre-commit hooks installed"

clean:
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name htmlcov -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name .coverage -delete 2>/dev/null || true
	find . -type f -name coverage.xml -delete 2>/dev/null || true
	find . -type d -name .mypy_cache -exec rm -rf {} + 2>/dev/null || true
	@echo "✓ Cleaned up test artifacts"
