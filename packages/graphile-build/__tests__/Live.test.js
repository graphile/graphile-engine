import { LiveSource, LiveCoordinator, LiveProvider } from "../src/Live";

class DummyProvider extends LiveProvider {
  namespace = "dummy";

  collectionIdentifierIsValid() {
    return true;
  }

  recordIdentifierIsValid() {
    return true;
  }
}

class DummySource extends LiveSource {
  collectionListeners = [];
  recordListeners = [];
  subscribeCollection(callback, collectionIdentifier, predicate) {
    const entry = [collectionIdentifier, predicate];
    this.collectionListeners.push(entry);
    return () => {
      const i = this.collectionListeners.indexOf(entry);
      if (i >= 0) {
        this.collectionListeners.splice(i, 1);
      }
    };
  }

  subscribeRecord(callback, collectionIdentifier, recordIdentifier) {
    const entry = [collectionIdentifier, recordIdentifier];
    this.recordListeners.push(entry);
    return () => {
      const i = this.recordListeners.indexOf(entry);
      if (i >= 0) {
        this.recordListeners.splice(i, 1);
      }
    };
  }
}

const dummySource = new DummySource();

test("works", async () => {
  const lc = new LiveCoordinator();
  const dummyProvider = new DummyProvider();
  lc.registerProvider(dummyProvider);
  lc.registerSource("dummy", dummySource);
  throw new Error("UNIMPLEMENTED");
});
