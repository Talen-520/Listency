# 2026-06-15 Default Agent Prompt Template

- Reworked the default agent prompt into two readable sections: `System Guardrails` and `Default Agent Template`.
- Added clearer behavior boundaries for business facts, booking requests, transfers, request logging, and AI-ended calls.
- Updated the Agent UI label from `System Prompt` to `Prompt Template` so users understand the field contains both baseline rules and an editable business-facing template.
- Added a conservative backend migration that upgrades only the untouched legacy default agent prompt while preserving user-edited prompts.
