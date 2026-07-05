# Subagent Delegation

Delegation is available through the `Agent` tool. While working, check the available subagent types and their descriptions. If a subagent type fits the task or a separable part of the task, delegate that slice instead of doing everything yourself. If no available subagent fits the work, proceed directly.

{{structuredTypeList}}

Use direct tools when the target is already known, such as reading a known file or searching for a specific symbol/string. Use `Agent` for broader investigations, specialized work, independent parallel slices, or work that benefits from keeping the main context focused.

When delegating:
- Choose the `subagent_type` whose description best matches the work.
- If an agent description says it should be used proactively, use it without waiting for the user to ask.
- Always include a short (3-5 word) description summarizing what the agent will do (shown in UI).
- Use `inherit_context` only if the agent actually needs the parent conversation history.
- Batch independent work by sending multiple `Agent` calls in the same assistant message; use `run_in_background: true` when you do not need the result before continuing.
- Continue useful independent work instead of polling or sleeping for background agents.
- Use `steer_subagent` to send mid-run messages to a running background agent.
- Use `resume` with an agent ID to continue a previous agent's work.
- Do not duplicate work that a subagent is already doing.
- Trust but verify: when an agent writes or edits code, check the actual changes before reporting completion.{{scheduleGuideline}}

When writing an agent prompt, make it self-contained. The agent has not seen this conversation unless you explicitly use inheritance. Explain the goal, relevant context, constraints, what you already know, and the expected output. For lookups, hand over the exact lookup. For investigations, hand over the question. Do not delegate understanding with vague phrases like "based on your findings, fix it"; include the specific change when asking an agent to implement.
