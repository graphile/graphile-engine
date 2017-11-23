// @flow
const bindAll = (obj: {}, keys: Array<string>) => {
  keys.forEach(key => {
    obj[key] = obj[key].bind(obj);
  });
  return obj;
};

const parseTags = (str: string) => {
  return str.split(`\n`).reduce((prev, curr) => {
    const match = curr.match(/^@[a-z]+ ?/);
    return match &&
    prev.text === "" &&
    curr.split(" ")[0] === match[0].split(" ")[0]
      ? Object.assign({}, prev, {
          tags: Object.assign({}, prev.tags, {
            [match[0].substr(1).trim()]:
              match[0] === curr ? true : curr.replace(match[0], ""),
          }),
        })
      : Object.assign({}, prev, {
          text: prev.text === "" ? curr : `${prev.text}\n${curr}`,
        });
  }, {
    tags: {},
    text: "",
  });
};

export { bindAll, parseTags };
