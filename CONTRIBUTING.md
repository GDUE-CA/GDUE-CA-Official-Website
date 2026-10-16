# Contributing to GDUE-CA Official Website

Thank you for your interest in contributing! This project is **Source-Available** — the source code is publicly viewable for learning and research. Before contributing, please read and accept the [LICENSE](./LICENSE).

> Chinese reference version: [CONTRIBUTING-ZH.md](./CONTRIBUTING-ZH.md) — for reading convenience only; this English version prevails.

## Ground Rules

- The project is licensed under the [LICENSE](./LICENSE) (Source-Available, not an OSI-approved license). By contributing, you agree to its terms, including the contribution grant in Section 6.
- The project maintainer (the Computer Association, GDUE-CA) holds the **sole and final authority to merge or reject any Pull Request**.

## Reporting Bugs & Suggesting Features

1. Search existing [Issues](https://github.com/paperee/GDUE-CA-Official-Website-main/issues) first to avoid duplicates.
2. Open a GitHub Issue and include:
   - Environment (OS / browser / Node / pnpm / Python versions as relevant);
   - Clear steps to reproduce, expected vs. actual behavior;
   - Screenshots or logs where applicable.
3. **Security vulnerabilities**: do NOT open public Issues for exploitable security problems. Contact the Association privately through official channels instead.

## Pull Request Workflow

1. Fork the repository and create your branch from `main`:
   - `feat/<module>-<summary>` for features
   - `fix/<summary>` for bug fixes
   - `docs/<topic>` for documentation
2. Keep each PR focused on a single topic.
3. Follow the existing code conventions:
   - **Frontend**: TypeScript strict mode with zero `tsc --noEmit` errors, ESLint clean; the Edge layer contains only `proxy.ts` — never create `middleware.ts`; password inputs must reuse the global `PasswordInput` component (no raw `type="password"`).
   - **Backend**: keep the existing layering (`api → schemas → core/db`); use enums for business states, the unified response envelope and `BizException`; every admin mutation must write an audit log; deletions are always soft-deletes.
4. Before submitting, self-check:
   - Backend `pytest` passes;
   - Frontend `tsc` / `lint` pass with no errors;
   - i18n keys added for all supported languages;
   - No secrets or local build artifacts committed.
5. Open the PR with a clear description of **what** changed and **why**.

## Contribution License Grant (IMPORTANT)

By submitting a Pull Request, patch, or code snippet to this project, you grant Guangdong University of Education Computer Association (GDUE-CA) a **perpetual, worldwide, non-exclusive, irrevocable, royalty-free right** to use, reproduce, adapt, modify, refactor, and distribute your contribution as part of this project. Full copyright is **not** assigned — usage rights only. See [LICENSE](./LICENSE) Section 6.

## Code of Conduct

- Do not impersonate the Association or present any fork or derivative work as an official release.
- Do not publish content that damages the reputation of the Association or maliciously parodies it.
- Be respectful in Issue and PR discussions.

## License

By contributing, you agree that your contributions and this project are governed by the [LICENSE](./LICENSE).
