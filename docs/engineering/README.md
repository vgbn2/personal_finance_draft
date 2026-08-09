# Engineering Documentation

Current engineering standards, system-wide architecture explanations, implementation specifications, and architecture decisions live here.

## Owns

- documentation and engineering standards;
- cross-module architecture and dependency direction;
- implementation-facing specifications that do not belong to one module;
- architecture decisions and their consequences.

## Does Not Own

- per-module contracts (`docs/modules/`);
- detailed algorithms, structures, protocols, or flows (`docs/atlas/`);
- operator procedures (`docs/operational/`);
- session state or review evidence (`workspace/`).

## Start Here

- [Documentation standard](documentation_standard.md)
- [Architecture overview](architecture_overview.md)
- [Codebase organization](codebase_org.md) — retained as `needs_refresh` until source revalidation is complete.
- [Technical specification](technical_spec.md) — retained as `needs_refresh`.

The [documentation manifest](../documentation_manifest.json) records canonical status and source-review triggers.