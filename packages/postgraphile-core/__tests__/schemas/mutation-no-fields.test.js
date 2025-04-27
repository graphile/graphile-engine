import { testSchema } from "../helpers-v5";

it("prints a schema from a table with no mutable fields", () =>
  testSchema(__filename, {
    schema: "no_fields",
  }));
