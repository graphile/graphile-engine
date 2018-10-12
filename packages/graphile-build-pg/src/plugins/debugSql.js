import debugFactory from "debug";

const rawDebugSql = debugFactory("graphile-build-pg:sql");

function debugSql(sql) {
  if (!rawDebugSql.enabled) {
    return;
  }
  let indentLevel = 0;
  function handleIndent(match) {
    if (match === "(") {
      indentLevel++;
      return "(\n" + "  ".repeat(indentLevel);
    } else if (match === ")") {
      indentLevel--;
      return "\n" + "  ".repeat(indentLevel) + ")";
    } else {
      return "\n" + "  ".repeat(indentLevel) + match.replace(/^\s/, "");
    }
  }
  const tidySql = sql
    .replace(/\s+/g, " ")
    .replace(/\s+(?=$|\n|\))/g, "")
    .replace(/(\n|^|\()\s+/g, "$1")
    .replace(
      /([()]| (select|insert|update|delete|from|where|and|or|order|limit) )/g,
      handleIndent
    );
  rawDebugSql("%s", "\n" + tidySql);
}
Object.assign(debugSql, rawDebugSql);

export default debugSql;
