# Contributing to BTC Perpetual Arbitrage Bot

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/yourusername/dexarb.git`
3. Create a feature branch: `git checkout -b feature/your-feature-name`
4. Make your changes
5. Test thoroughly
6. Commit with clear messages
7. Push to your fork
8. Open a Pull Request

## Development Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode
npm run dev

# Watch for changes
npm run watch
```

## Code Style

- Use TypeScript for all new code
- Follow existing code structure and patterns
- Add comments for complex logic
- Keep functions focused and small
- Use meaningful variable names

## Testing

Before submitting a PR:
- [ ] Code builds without errors (`npm run build`)
- [ ] Test with small position sizes first
- [ ] Verify both exchanges work correctly
- [ ] Check logs for errors
- [ ] Test web interface functionality

## Pull Request Guidelines

- Provide a clear description of changes
- Reference any related issues
- Include screenshots for UI changes
- Update documentation if needed
- Keep PRs focused on a single feature/fix

## Reporting Issues

When reporting bugs, please include:
- Bot version
- Node.js version
- Operating system
- Steps to reproduce
- Error messages/logs
- Expected vs actual behavior

## Security

**Never commit:**
- API keys or private keys
- `config.json` file
- `.env` file
- Any sensitive credentials

If you discover a security vulnerability, please email privately instead of opening a public issue.

## Questions?

Feel free to open an issue for questions or discussions about the bot's functionality.

---

Thank you for contributing! 🚀
