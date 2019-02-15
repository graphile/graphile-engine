import PgLogicalDecoding from "../src/pg-logical-decoding";

test("opens and closes cleanly", async () => {
  const ld = new PgLogicalDecoding("lds_test", {
    temporary: true,
  });
  await ld.close();
});
