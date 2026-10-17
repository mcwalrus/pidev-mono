# Dev workflow tasks for pidev-mono. Mirrors .github/workflows/ci.yml.
# Run `just` for the recipe list.
set shell := ["bash", "-uc"]

# List available recipes
default:
    @just --list

# Install dependencies from the lockfile, exactly as CI does
install:
    npm ci

# Format, lint, and type-check. Biome writes fixes in place.
[group('check')]
check:
    npm run check

[group('check')]
check-decision-codes:
    npm run check:decision-codes

[group('check')]
check-file-sizes:
    npm run check:file-sizes

# Run the test suite
[group('test')]
test:
    npm run test

# Test suite with coverage thresholds
[group('test')]
coverage:
    npm run coverage

# Everything CI runs, in order. Run before pushing.
[group('test')]
ci: install check-decision-codes check-file-sizes check
    npm run coverage -- --reporter=default --reporter=json --outputFile=test-results.json

# Cut a release locally: just release patch|minor|major
# Publishes to npm and commits + tags, but never pushes — add `--push` when
# running scripts/release.mjs directly (or `git push`) to publish the commits.
[group('release')]
release level:
    @case "{{level}}" in patch|minor|major) ;; *) echo "usage: just release patch|minor|major" >&2; exit 2;; esac
    node scripts/release.mjs {{level}}

# Remove node_modules and the root lockfile
clean:
    rm -rf node_modules packages/*/node_modules package-lock.json
