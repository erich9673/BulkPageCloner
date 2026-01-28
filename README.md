# Bulk Page Cloner for Confluence

A simplified Confluence Forge app that focuses on the core value of bulk page cloning - taking existing pages and creating multiple copies efficiently.

## Core Features

This app simplifies the original Bulk Report Generator down to just the most valuable workflow:

1. **Upload Template** - Select any existing Confluence page as your template
2. **Space & Page Selection** - Choose where to create the new pages
3. **Bulk Clone** - Create multiple copies with custom naming

## Quick Start

```bash
npm install
forge deploy
forge install
forge tunnel
```

## Development

- **Frontend**: `src/frontend/` - React components using Forge UI Kit
- **Backend**: `src/resolvers/` - Forge resolvers for Confluence API
- **Configuration**: `manifest.yml` - App permissions and modules

## Architecture

This app extracts and simplifies the best parts of the original Bulk Report Generator:
- Upload Template functionality (original step 3b)
- Space and Page Selection (original step 1)
- Bulk Generation logic (original step 4)

Built with Atlassian Forge for secure, native integration with Confluence.