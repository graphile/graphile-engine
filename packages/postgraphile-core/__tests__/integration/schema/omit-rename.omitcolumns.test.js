const core = require("./core");

test("omit create on column", core.test(["d"], {}, `
comment on column d.tv_shows.title is E'@omit create';
`));

test("omit update on column", core.test(["d"], {}, `
comment on column d.tv_shows.title is E'@omit update';
`));