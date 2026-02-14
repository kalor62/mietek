# Example Skill: Weather

This file is a template showing how to create a custom skill for Mietek.
Skills are markdown files that provide Claude with domain-specific knowledge
and instructions. They are referenced in CLAUDE.md and loaded as context
when relevant.

## When to activate

When the user asks about weather, forecasts, or temperature.

## Instructions

1. Use the `WebFetch` tool to check a weather API
2. Format the response concisely for WhatsApp
3. Include temperature, conditions, and forecast

## Example queries

- "Jaka pogoda?" → Check weather for user's default city
- "Pogoda w Warszawie" → Check weather for Warsaw
- "Czy jutro będzie padać?" → Check tomorrow's forecast

## How to add your own skill

1. Create a new `.md` file in `src/skills/`
2. Describe when the skill should activate and what instructions to follow
3. Reference it in `CLAUDE.md` under the Skills section
4. If the skill needs MCP tools, configure them in `mcp-config.json`
