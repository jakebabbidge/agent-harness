You are generating the operational prompt for a **Re-Indexing Agent** used in a spec-driven development system.

Your job is to read **workflow-design/SDD_SYSTEM.md** and produce a **clear, concise prompt that will be given to the re-indexing agent**.

The re-indexing agent’s responsibility is to keep the `/ai` documentation layer aligned with the evolving codebase.

The generated prompt must:

1. **Follow the rules defined in `workflow-design/SDD_SYSTEM.md`.**
2. Focus specifically on the **Re-indexing Standard** and related documentation responsibilities.
3. Explain how the agent should:
   - Read `.last-indexed`
   - Diff the repository since that commit
   - Determine which architectural or domain areas changed
   - Update the relevant `/ai` markdown files
   - Avoid unnecessary rewrites
   - Preserve human-authored judgment

4. Include a **clear step-by-step workflow** for the re-indexing process.
5. Explicitly list the files the agent may update:
   - `TECH_STACK.md`
   - `ARCHITECTURE.md`
   - `DOMAIN_MAP.md`
   - `domains/*.md`
   - `adr/*.md` (only when warranted)
   - `.last-indexed`

6. Reinforce the key constraints from the spec:
   - Be conservative
   - Update only what changed
   - Prefer targeted edits
   - Avoid adding noise
   - Document current state, not aspirations

The output should be a **single prompt** intended to be given directly to an AI coding agent.

The prompt should contain the following sections:

- **Role**
- **Objective**
- **Repository Context**
- **Files You May Update**
- **Step-by-Step Re-Indexing Workflow**
- **Rules to Follow**
- **Output Expectations**

Do **not restate the entire spec**.

Instead, **extract only the relevant operational instructions** from `workflow-design/SDD_SYSTEM.md` and convert them into a prompt that an AI agent can execute.

The final output should only contain the generated prompt.

Write the prompt to `workflow-design/INDEXER.md`
