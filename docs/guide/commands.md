# Command Cookbook

These commands are examples to include and adapt while writing the full guide.

## Windows And PowerShell

```powershell
Get-Location
Get-ChildItem
Get-ChildItem -Recurse docs\guide
```

## Node And NPM

```powershell
node --version
npm --version
npm install
npm test
npm.cmd test
node --test tests\scripts\tests\some_test.js
```

On some Windows setups, `npm.ps1` is blocked by PowerShell execution policy while `npm.cmd` still works. If `npm test` fails with a script-policy error, retry with `npm.cmd test`.

## C++ And CMake

```powershell
cmake -S backend\core -B backend\core\build
cmake --build backend\core\build --config Release
```

## Git

```powershell
git status --short -- .
git diff -- docs\guide
git branch --show-current
```

## Docker

```powershell
docker --version
docker compose version
docker compose -f infra\docker\docker-compose.yml config
```

## Verification Examples

```powershell
Get-ChildItem docs\guide -Recurse -Filter README.md | ForEach-Object {
  [PSCustomObject]@{
    File = $_.FullName
    Lines = (Get-Content $_.FullName).Count
  }
}
```

Worked-example checks:

```powershell
cd docs\guide\examples\minimal_sovereign
npm.cmd test
node backend\cli\sovereign_cli.js status --json
node backend\scripts\ingest_example.js
```

## Authoring Rule

Every chapter should include:

- one command the reader can run immediately
- one command that verifies the chapter outcome
- one command that helps debug failure
