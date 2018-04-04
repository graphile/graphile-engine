const core = require("./core");

test("omit create, update and delete", core.test(["d"], {}, `
comment on table d.films is E'@omit create,update,delete';
`));

test("omit create", core.test(["d"], {}, `
comment on table d.films is E'@omit create';
`));

test("omit update", core.test(["d"], {}, `
comment on table d.films is E'@omit update';
`));

test("omit delete", core.test(["d"], {}, `
comment on table d.films is E'@omit delete';
`));

test("omit and omit many", core.test(["d"], {}, `
comment on table d.tv_shows is E'@omit';
comment on table d.tv_episodes is E'@omit many';
`));