PROJECT_NAME = data-foundry
VERSION = 1.0
PACKAGE = $(PROJECT_NAME)-$(VERSION).zip

CORE_PATHS = data-foundry-agent,data-foundry-backend,data-foundry-frontend,docs,README.md,start-agent.cmd,start-backend.cmd,start-frontend-dev.cmd

all: package

package:
	powershell -NoProfile -Command "if (Test-Path '$(PACKAGE)') { Remove-Item '$(PACKAGE)' -Force }; Compress-Archive -Path $(CORE_PATHS) -DestinationPath '$(PACKAGE)' -Force"

clean:
	powershell -NoProfile -Command "if (Test-Path '$(PACKAGE)') { Remove-Item '$(PACKAGE)' -Force }"

rebuild: clean package

.PHONY: all package clean rebuild