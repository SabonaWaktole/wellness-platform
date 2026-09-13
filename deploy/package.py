#!/usr/bin/env python3
"""Builds the two deployment archives.

Everything needed to install, build and run on the server; nothing else. The
exclusions are explicit rather than a .gitignore sweep so that what ships is a
decision rather than a side effect — and so that secrets and uploaded customer
media cannot be swept in by accident.
"""
import os, sys, zipfile, fnmatch

ROOT = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(ROOT)

# Never shipped, in either archive.
COMMON_EXCLUDE_DIRS = {
    'node_modules',      # reinstalled on the server from package-lock.json
    '.git', '.github',
    'coverage', '.nyc_output',
    '.vite', '.turbo', '.cache',
    '__pycache__',
}
COMMON_EXCLUDE_GLOBS = [
    '.env', '.env.*', '*.env',          # secrets — never in a deployable archive
    '*.log', '*.tsbuildinfo',
    '.DS_Store', 'Thumbs.db',
    '*.zip',
]

PROJECTS = {
    'backend': {
        'exclude_dirs': {
            'uploads',      # customer media: belongs on the server, not in a release
            'tests',        # jest suites and fixtures
        },
        'exclude_globs': [
            'jest.config.ts', 'tsconfig.test.json',
            'prompt.md', 'check_db.ts', 'queryUsers.js',
            'run-test.js', 'run-test.ts', 'test_login.ts',
            '*.test.ts',
        ],
    },
    'frontend': {
        'exclude_dirs': {
            'tests',            # playwright end-to-end specs
            '.storybook',
            'test-results', 'playwright-report', 'storybook-static',
        },
        'exclude_globs': [
            'playwright.config.ts',
            'vitest.config.ts', 'vitest.shims.d.ts',
            'fix-imports.cjs', 'vcat.mjs',
            '*.test.ts', '*.test.tsx', '*.stories.tsx',
            'setupTests.ts',
        ],
    },
}


def excluded(rel_path, name, is_dir, spec):
    if is_dir:
        return name in COMMON_EXCLUDE_DIRS or name in spec['exclude_dirs']
    for pattern in COMMON_EXCLUDE_GLOBS + spec['exclude_globs']:
        if fnmatch.fnmatch(name, pattern):
            return True
    return False


def build(project):
    spec = PROJECTS[project]
    src_root = os.path.join(REPO, project)
    out = os.path.join(ROOT, f'nevacrm-{project}.zip')
    if os.path.exists(out):
        os.remove(out)

    files, total = [], 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for dirpath, dirnames, filenames in os.walk(src_root):
            rel_dir = os.path.relpath(dirpath, src_root)
            dirnames[:] = sorted(d for d in dirnames if not excluded(rel_dir, d, True, spec))
            for name in sorted(filenames):
                if excluded(rel_dir, name, False, spec):
                    continue
                abs_path = os.path.join(dirpath, name)
                if os.path.islink(abs_path):
                    continue
                rel = os.path.relpath(abs_path, src_root)
                zf.write(abs_path, os.path.join(project, rel))
                files.append(rel)
                total += os.path.getsize(abs_path)

    size = os.path.getsize(out)
    print(f'{project:9s} {len(files):5d} files  {total/1048576:7.1f} MB raw  ->  {size/1048576:6.1f} MB zipped')

    # A release that leaked a secret or a customer upload would be a bad one.
    for rel in files:
        base = os.path.basename(rel)
        assert not base.startswith('.env'), f'SECRET LEAKED: {rel}'
        assert 'node_modules' not in rel.split(os.sep), f'node_modules leaked: {rel}'
        assert not rel.startswith('uploads' + os.sep), f'upload leaked: {rel}'
    return out, files


if __name__ == '__main__':
    for project in ('backend', 'frontend'):
        build(project)
