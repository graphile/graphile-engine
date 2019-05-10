import LRU from "..";

it("basics", () => {
  const cache = new LRU({ maxLength: 3 });
  expect(cache.get("foo")).toBe(undefined);
  cache.set("foo", 27);
  expect(cache.get("foo")).toEqual(27);
  expect(cache.length).toEqual(1);
  cache.set("foo", 28);
  expect(cache.get("foo")).toEqual(28);
  expect(cache.length).toEqual(1);
  cache.set("bar", 29);
  cache.set("baz", 30);
  expect(cache.length).toEqual(3);
  expect(cache.get("foo")).toEqual(28);
  expect(cache.get("bar")).toEqual(29);
  expect(cache.get("baz")).toEqual(30);
  // foo is now the least recently used
  cache.set("qux", 31);
  expect(cache.length).toEqual(3);
  expect(cache.get("foo")).toBe(undefined);
  expect(cache.get("bar")).toEqual(29);
  expect(cache.get("baz")).toEqual(30);
  expect(cache.get("qux")).toEqual(31);
});
