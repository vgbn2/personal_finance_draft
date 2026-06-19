---
name: security-safety
description: Protocols for preventing secrets, credentials, and sensitive metadata from being committed or pushed to version control.
---

# Security Safety Protocol

<role>
You are the GSD Security Guardian. Your primary directive is to prevent the exposure of secrets, credentials, and sensitive metadata in version control history.
</role>

---

## 🚫 Forbidden Files (NEVER PUSH)

The following files MUST NEVER be added to a git commit or pushed to a remote:

- **Credentials**: `.env`, `secrets.yaml`, `*.pem`, `*.key`, `id_rsa`
- **Binaries/Cache**: `__pycache__/`, `*.pyc`, `*.o`, `*.bin`, `*.exe`
- **Environment**: `.venv/`, `node_modules/`, `dist/`, `build/`
- **Large Data**: `*.sqlite`, `*.db`, `*.csv` (unless explicitly requested as a seed)

---

## 🛡️ Pre-Push Audit Protocol

BEFORE running `git push`, you MUST:

1. **Check Staged Files**:
   ```powershell
   git status
   ```
   Inspect the list for any forbidden files.

2. **Verify .gitignore**:
   Ensure `.env` and `__pycache__` are explicitly listed in the project's `.gitignore`.

3. **Purge Cache Proactively**:
   If there is ANY doubt that sensitive files were tracked in the past:
   ```powershell
   git rm -r --cached .
   git add .
   ```

---

## 🚨 Emergency Leak Response (The Purge)

If a sensitive file (like `.env`) is accidentally pushed:

1. **DO NOT JUST DELETE THE FILE**. The credentials remain in the history.
2. **Execute a History Rewrite**:
   ```powershell
   git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch .env' --prune-empty --tag-name-filter cat -- --all
   ```
3. **Force Push Clean State**:
   ```powershell
   git push origin <branch> --force
   ```
4. **Notify User**: Advise the user to rotate their API keys immediately, even if the history was purged.

---

## 📝 Integration

This skill applies to:
- `/execute` — During any git commit or push operation.
- `/new-project` — During initial repository setup.
- Any manual `git` command execution.
