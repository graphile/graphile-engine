const core = require("./core");

test("omitting some stuff", core.test(["d"], {}, `
comment on table d.films is E'@omit create,update,delete';
comment on table d.tv_shows is E'@omit';
comment on table d.tv_episodes is E'@omit many';
`));
