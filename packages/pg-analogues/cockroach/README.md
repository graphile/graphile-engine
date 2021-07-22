To run tests against cockroach:

1. install cockroach via `./cockroach-get-nightly.sh`
2. `export TEST_DATABASE_URL="postgresql://root:root@localhost:26257/pggql_test"`
3. `export COCKROACH=1`
3. Inside the root folder run `yarn test`