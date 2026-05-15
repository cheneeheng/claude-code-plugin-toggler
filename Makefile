.PHONY: sync-css

# Copy canonical CSS from html/ into the VSCode webview directory.
# Run this after any change to html/styles.css.
sync-css:
	cp html/styles.css vscode-extension/webview/styles.css
	@echo "styles.css synced -> vscode-extension/webview/styles.css"
