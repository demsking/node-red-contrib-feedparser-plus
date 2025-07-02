PACKAGE_VERSION := $(shell jq -r '.version' package.json)

shell:
	tmuxinator

stop:
	tmux kill-session -t node-red-contrib-feedparser-plus

lint:
	pre-commit run --all-files

fix:
	ruff check . --fix

.PHONY: test
test:
	npm test

#
## Dependencies
install:
	npm install

outdated: install
	npm outdated

update:
	npm update
	devbox update
	pre-commit autoupdate


#
## Packaging
package: lint test
	npm pack

publish: package
	git commit package.* -m "Release $(PACKAGE_VERSION)"
	npm publish --access public
	git tag v$(PACKAGE_VERSION)
	git push --tags origin main
