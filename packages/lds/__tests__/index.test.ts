import subscribeToLogicalDecoding from "../src/index";
import { DATABASE_URL, withClient } from "./helpers";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("cleans up", async () => {
  const mockCallback = jest.fn();
  const sub = await subscribeToLogicalDecoding(DATABASE_URL, mockCallback, {
    temporary: true,
    sleepDuration: 50,
    slotName: "index_test_slot",
  });
  await withClient(DATABASE_URL, async pgClient => {
    const {
      rows: [{ id }],
    } = await pgClient.query(
      "insert into app_public.foo(name) values ('temp') returning id"
    );
    await sleep(100);
    await pgClient.query(
      "update app_public.foo set name = 'Bar' where id = $1",
      [id]
    );
    await sleep(100);
    await pgClient.query("delete from app_public.foo where id = $1", [id]);
  });
  await sub.close();
  expect(mockCallback).toHaveBeenCalledTimes(3);
  // Now run a new mutation, and expect the mockCallback not to have been called
  await withClient(DATABASE_URL, pgClient =>
    pgClient.query(
      "insert into app_public.foo(name) values ('temp') returning id"
    )
  );
  expect(mockCallback).toHaveBeenCalledTimes(3);
});
