# Branch Creation Guide — SERMS

Welcome to the SERMS Branch Creation Guide. This document details our branching strategy, how to name your branches properly, and how to keep them synchronized with the rest of the team.

This guide works in tandem with our [Issue Creation Guide](ISSUE_GUIDE.md) and [Pull Request Guide](PR_GUIDE.md).

---

## 1. Branching Strategy: GitFlow

SERMS utilizes the **GitFlow** branching model. This provides a robust framework for managing concurrent feature development, release preparation, and hotfixes.

### The Core Branches
- **`main`**: The canonical, production-ready state of the system. Direct commits to `main` are strictly prohibited.
- **`develop`**: The integration branch for features. This contains the latest delivered development changes for the next release.

### Temporary Branches
- **`feature/*`**: Used to develop new features or bug fixes. Branches off from `develop` and merges back into `develop`.
- **`release/*`**: Used to prepare for a new production release. Branches off from `develop` and merges into both `main` and `develop`.
- **`hotfix/*`**: Used to quickly patch production issues. Branches off from `main` and merges into both `main` and `develop`.

---

## 2. Branch Naming Convention

When creating a temporary branch, we use a clear prefix followed by the module or feature description, ending with the related Issue ticket ID.

### Format
`<type>/<module-or-description>-#<ticket-id>`

### Examples
- `enhance/reimbursement-#12` (Branches from `develop`)
- `feat/login-screen-#123` (Branches from `develop`)
- `fix/ocr-crash-#456` (Branches from `develop`)
- `release/v1.2.0` (Branches from `develop`)
- `hotfix/auth-bypass-#999` (Branches from `main`)

**Pre-requisite:** Before creating a branch, ensure there is an active tracking issue created following the [Issue Creation Guide](ISSUE_GUIDE.md).

---

## 3. Creating and Managing Your Branch

**Example Scenario:** You are working on issue `#12` which is an enhancement to the reimbursement module. Since it's an enhancement, the type is `feat`.

### Step 1: Sync your local repository
Always start by checking out the base branch and pulling the latest changes.
```bash
git checkout develop
git pull origin develop
```

### Step 2: Create your branch
Following our preferred naming convention, you will create the branch using the type (`enhance`), the module or short description (`reimbursement`), and the ticket ID (`#12`).
```bash
git checkout -b enhance/reimbursement-#12
```

### Step 3: Keep your branch up to date (Rebasing)
To keep a clean, linear history, we prefer **rebasing** over merging when syncing your feature branch with `develop`.
```bash
git fetch origin
git rebase origin/develop
```
If there are conflicts, resolve them carefully, and then `git rebase --continue`.

---

## 4. Finalizing Your Work

Once development is complete:
1. Ensure your individual commit messages follow the formats outlined in the [Pull Request Guide](PR_GUIDE.md).
2. Push your branch to the remote repository:
   ```bash
   git push -u origin feat/SERMS-123-your-feature
   ```
3. Open a Pull Request targeting the appropriate branch (usually `develop`).

**Post-Merge Cleanup:**
After your Pull Request is merged, you have the **option to delete** the branch or keep it for historical reference. We encourage deleting merged feature branches to keep the repository clean, but it is not strictly mandated.

---

By adhering to these GitFlow and naming standards, we ensure SERMS continues to have a highly readable, reliable, and auditable version history.
