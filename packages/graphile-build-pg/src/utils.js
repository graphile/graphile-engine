// @flow
export const parseTags = (str: string) => {
  return str.split(/\r?\n/).reduce(
    (prev, curr) => {
      if (prev.text !== "") {
        return { ...prev, text: `${prev.text}\n${curr}` };
      }
      const match = curr.match(/^@[a-zA-Z][a-zA-Z0-9_]*($|\s)/);
      if (!match) {
        return { ...prev, text: curr };
      }
      const key = match[0].slice(1).trim();
      const value = match[0] === curr ? true : curr.replace(match[0], "");
      return {
        ...prev,
        tags: {
          ...prev.tags,
          [key]: !Object.prototype.hasOwnProperty.call(prev.tags, key)
            ? value
            : Array.isArray(prev.tags[key])
            ? [...prev.tags[key], value]
            : [prev.tags[key], value],
        },
      };
    },
    {
      tags: {},
      text: "",
    }
  );
};

export function arraysMatch<T>(
  array1: ReadonlyArray<T>,
  array2: ReadonlyArray<T>,
  comparator: (val1: T, val2: T) => boolean = (v1, v2) => v1 === v2
): boolean {
  const l = array1.length;
  if (l !== array2.length) {
    return false;
  }

  for (let i = 0; i < l; i++) {
    if (!comparator(array1[i], array2[i])) {
      return false;
    }
  }
  return true;
}
