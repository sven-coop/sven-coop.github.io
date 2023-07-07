# Sven Co-op Documentation Generator

https://sven-coop.github.io/


Based on baso88's (with quality of life features.)


## TODO
 - ScriptBases Documentation
 - Community notes


## Building
When Sven Co-op updates to a new version, the AngelScript API will change.
To build your own documentation if this repository becomes outdated:

- Run Sven Co-op with the launch command: `-as_outputdocs outputdocs`
- This will create a file at `...\Sven Co-op\svencoop\outputdocs.txt`
- Move the newly generated `outputdocs.txt` into a clone of this repo.
- Update or install [Node.js](https://nodejs.org/en).
- In terminal, set your working directory to the cloned repo.
- Type `npm install` to install the dependencies. 
- Type `npm run build` to generate the site into a `dist` folder.