---
name: default
mode: primary
description: Default agent
permission:
  defaultPolicy:
    tools: ask
    bash: ask
    mcp: ask
    skills: ask
    special: ask
  tools:
    "*:/home/joey/.agents/*": allow
    "*:/home/joey/repos/*": allow
    "*.env": deny
    "*.env.*": deny
    "*.env.example": allow
  bash:
    "rm *": ask
    "rm -rf *": deny
    "sudo *": deny
    "git commit *": ask
    "* push *": deny
    "brew *": ask
  special:
    external_directory: ask
    "external_directory:/home/joey/.agents/*": allow
    "external_directory:/home/joey/repos/*": allow
    "external_directory:*personal*": deny
    "external_directory:*pi-permission-system/config.json": deny
---
