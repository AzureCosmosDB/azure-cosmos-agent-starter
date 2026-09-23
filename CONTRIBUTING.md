# Contributing

Use Node.js 20 or newer. Run `npm install` and `npm run validate`.

Add reusable content under a feature pack's `template` folder. Add its ID to a declarative scenario
only after dependencies are explicit and composition remains deterministic. A new base should contain
only language/runtime fundamentals. Tests should generate into OS temporary directories and clean them.

For generated-output changes, run the generator tests, generate a fresh project, run `npm install`,
`npm run typecheck`, `npm test`, and `npm run build` inside it, then run `doctor` and `validate`.
