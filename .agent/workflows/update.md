---
name: Update
description: Update plugin version and publish to ClawHub
---

# Update

1. Read `package.json` to get the current version.
2. Ensure you have updated instructions or metadata in other files if needed.
3. Update the version in `package.json` to the new version.
4. Run `node docs/bump-version.js` to sync versions across files.
5. Run `node docs/build-and-publish.js` to commit, push to Git, tag, and publish to ClawHub.

> **IMPORTANT**: The build-and-publish script handles all git operations and publishing.
