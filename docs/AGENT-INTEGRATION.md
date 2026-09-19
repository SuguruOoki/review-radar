# Claude Code / Codex integration

The CLI and a companion `SKILL.md` are bundled. They have not been installed in your local agent. Confirm the agent's current skill-discovery paths in its official documentation (`SOURCES.md`).

## 1. Keep the CLI in a stable location

For example, extract it to `$HOME/tools/review-radar`. Add the following to a shell environment used to start the agent:

```sh
export REVIEW_RADAR_HOME="$HOME/tools/review-radar"
```

The skill does not contain a machine-specific absolute path and does not discover the API key itself. Agent subprocesses need access to the environment above. Otherwise, state the tool path explicitly in your request.

## 2. Install the companion instructions

From the extracted tool directory, use the path for your agent:

```sh
# Codex personal skills
mkdir -p "$HOME/.agents/skills"
cp -R skills/review-radar "$HOME/.agents/skills/"

# Claude Code personal skills
mkdir -p "$HOME/.claude/skills"
cp -R skills/review-radar "$HOME/.claude/skills/"
```

These are local instructions, not a plugin-marketplace package. Restart or reload the agent according to its current behavior. If a same-named skill already exists, back it up and inspect it before copying; do not unintentionally overwrite your customized instructions.

## 3. Example request

> 実装を終えたらReview Radarで今回の差分をローカル分析してください。必須確認、判断材料不足、下位監査候補を整理し、各項目の根拠と人間が答えるべき質問を提示してください。外部APIへは送信しないでください。

For Jev, explicitly authorize the target code disclosure separately. Neither having an API key nor installing the skill grants that authorization.

## ChatGPT Work

A standalone local skill folder is not, by itself, a registered ChatGPT Work plugin. This build does not include a Work plugin manifest or perform Work-side installation. The CLI can be used only where the tool and target Git repository are actually available to an execution environment. The HTML/Markdown/JSON can be reviewed separately, subject to confidentiality constraints.
