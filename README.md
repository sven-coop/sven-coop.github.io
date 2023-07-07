# Sven Co-op Documentation Generator

https://sven-coop.github.io/


Based on baso88's (with quality of life features.)


## TODO
 - ScriptBases Documentation
 - Community notes


## Building
When Sven Co-op updates to a new version the AngelScript API will change. To build your own documentation if this repository becomes outdated:

- Run Sven Co-op with the launch command: `-as_outputdocs outputdocs`
- This will place the documentation at `...\Sven Co-op\svencoop\outputdocs.txt`
- Place the newly generated `outputdocs.txt` into a clone of this repository.
- Build the site using `npm run build`, if you have Node.js installed.