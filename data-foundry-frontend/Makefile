.PHONY: init clean run build package rebuild

PROJECT_NAME = data-foundry-frontend
VERSION = 1.0
PACKAGE = $(PROJECT_NAME)-$(VERSION).zip
STAGE_DIR = .package_tmp

run:
	npm run dev

init:
	npm install

build:
	npm run build

package:
	powershell -NoProfile -Command "$$ErrorActionPreference='Stop'; \
	if (Test-Path '$(PACKAGE)') { Remove-Item '$(PACKAGE)' -Force }; \
	if (Test-Path '$(STAGE_DIR)') { Remove-Item '$(STAGE_DIR)' -Recurse -Force }; \
	New-Item -ItemType Directory -Path '$(STAGE_DIR)' | Out-Null; \
	Copy-Item 'app' '$(STAGE_DIR)\app' -Recurse; \
	Copy-Item 'components' '$(STAGE_DIR)\components' -Recurse; \
	Copy-Item 'lib' '$(STAGE_DIR)\lib' -Recurse; \
	Copy-Item 'pages' '$(STAGE_DIR)\pages' -Recurse; \
	if (Test-Path 'tests') { Copy-Item 'tests' '$(STAGE_DIR)\tests' -Recurse }; \
	if (Test-Path 'public') { Copy-Item 'public' '$(STAGE_DIR)\public' -Recurse }; \
	Copy-Item 'package.json' '$(STAGE_DIR)\package.json'; \
	if (Test-Path 'package-lock.json') { Copy-Item 'package-lock.json' '$(STAGE_DIR)\package-lock.json' }; \
	if (Test-Path 'tsconfig.json') { Copy-Item 'tsconfig.json' '$(STAGE_DIR)\tsconfig.json' }; \
	if (Test-Path 'tailwind.config.ts') { Copy-Item 'tailwind.config.ts' '$(STAGE_DIR)\tailwind.config.ts' }; \
	if (Test-Path 'next.config.js') { Copy-Item 'next.config.js' '$(STAGE_DIR)\next.config.js' }; \
	if (Test-Path 'postcss.config.js') { Copy-Item 'postcss.config.js' '$(STAGE_DIR)\postcss.config.js' }; \
	if (Test-Path 'next-env.d.ts') { Copy-Item 'next-env.d.ts' '$(STAGE_DIR)\next-env.d.ts' }; \
	if (Test-Path 'vitest.config.ts') { Copy-Item 'vitest.config.ts' '$(STAGE_DIR)\vitest.config.ts' }; \
	if (Test-Path 'README.md') { Copy-Item 'README.md' '$(STAGE_DIR)\README.md' }; \
	Compress-Archive -Path '$(STAGE_DIR)\*' -DestinationPath '$(PACKAGE)' -Force; \
	Remove-Item '$(STAGE_DIR)' -Recurse -Force"

rebuild: clean init build

clean:
	powershell -NoProfile -Command "if (Test-Path '.next') { Remove-Item '.next' -Recurse -Force }; if (Test-Path 'node_modules') { Remove-Item 'node_modules' -Recurse -Force }; if (Test-Path 'tsconfig.tsbuildinfo') { Remove-Item 'tsconfig.tsbuildinfo' -Force }; if (Test-Path '$(PACKAGE)') { Remove-Item '$(PACKAGE)' -Force }; if (Test-Path '$(STAGE_DIR)') { Remove-Item '$(STAGE_DIR)' -Recurse -Force }"