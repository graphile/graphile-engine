import debugFactory from "debug";
import chalk from "chalk";

const rawDebugSql = debugFactory("graphile-build-pg:sql");

function debugSql(sql) {
  if (!rawDebugSql.enabled) {
    return;
  }
  let colourIndex = 0;
  let allowedColours = [
    chalk.red,
    chalk.green,
    chalk.yellow,
    chalk.blue,
    chalk.magenta,
    chalk.cyan,
    chalk.white,
    chalk.gray,
    chalk.black,
  ];
  function nextColor() {
    colourIndex = (colourIndex + 1) % allowedColours.length;
    return allowedColours[colourIndex];
  }
  const colours = {};

  /* Yep - that's `colour` from English and `ize` from American */
  function colourize(str) {
    if (!colours[str]) {
      colours[str] = nextColor();
    }
    return colours[str].bold.call(null, str);
  }

  let indentLevel = 0;
  function handleIndent(match) {
    if (match === "(") {
      indentLevel++;
      return match + "\n" + "  ".repeat(indentLevel);
    } else if (match === ")") {
      indentLevel--;
      return "\n" + "  ".repeat(indentLevel) + match;
    } else if (match === "),") {
      indentLevel--;
      return (
        "\n" +
        "  ".repeat(indentLevel) +
        match +
        "\n" +
        "  ".repeat(indentLevel)
      );
    } else if (match === ",") {
      return match + "\n" + "  ".repeat(indentLevel);
    } else {
      return "\n" + "  ".repeat(indentLevel) + match.replace(/^\s+/, "");
    }
  }
  const tidySql = sql
    .replace(/\s+/g, " ")
    .replace(/\s+(?=$|\n|\))/g, "")
    .replace(/(\n|^|\()\s+/g, "$1")
    .replace(
      /(\(|\),?|,| (select|insert|update|delete|from|where|and|or|order|limit) )/g,
      handleIndent
    );
  const colouredSql = tidySql.replace(/__local_[0-9]+__/g, colourize);
  rawDebugSql("%s", "\n" + colouredSql);
}
Object.assign(debugSql, rawDebugSql);

export default debugSql;
