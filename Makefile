PROJECT_NAME = server-package
VERSION = 1.0
PACKAGE = $(PROJECT_NAME)-$(VERSION).zip
STAGE_DIR = $(PROJECT_NAME)

all: package

package:
	powershell -NoProfile -Command "\
	Remove-Item '$(STAGE_DIR)' -Recurse -Force -ErrorAction SilentlyContinue; \
	New-Item -ItemType Directory -Path '$(STAGE_DIR)' | Out-Null; \
	Copy-Item data-foundry-agent -Destination '$(STAGE_DIR)' -Recurse; \
	Copy-Item data-foundry-backend -Destination '$(STAGE_DIR)' -Recurse; \
	Copy-Item README.md -Destination '$(STAGE_DIR)' -ErrorAction SilentlyContinue; \
	Copy-Item pyproject.toml -Destination '$(STAGE_DIR)' -ErrorAction SilentlyContinue; \
	Copy-Item uv.lock -Destination '$(STAGE_DIR)' -ErrorAction SilentlyContinue; \
	Copy-Item requirements.txt -Destination '$(STAGE_DIR)' -ErrorAction SilentlyContinue; \
	Copy-Item .env.example -Destination '$(STAGE_DIR)' -ErrorAction SilentlyContinue; \
	Get-ChildItem '$(STAGE_DIR)' -Recurse -Directory -Force | \
	Where-Object { $$_.Name -in @('.git', '.venv', '__pycache__', 'node_modules', '.npm-cache', '.uv-cache') } | \
	Remove-Item -Recurse -Force; \
	Get-ChildItem '$(STAGE_DIR)' -Recurse -File -Force | \
	Where-Object { \
		$$_.Name -like '*.log' -or \
		$$_.Name -like '*.err.log' -or \
		$$_.Name -like '*.sqlite3' -or \
		$$_.Name -like '*.journal' -or \
		$$_.Name -eq '.DS_Store' \
	} | Remove-Item -Force; \
	if (Test-Path '$(PACKAGE)') { Remove-Item '$(PACKAGE)' -Force }; \
	Compress-Archive -Path '$(STAGE_DIR)' -DestinationPath '$(PACKAGE)' -Force"

clean:
	powershell -NoProfile -Command "\
	if (Test-Path '$(PACKAGE)') { Remove-Item '$(PACKAGE)' -Force }; \
	if (Test-Path '$(STAGE_DIR)') { Remove-Item '$(STAGE_DIR)' -Recurse -Force }"

rebuild: clean package

.PHONY: all package clean rebuild