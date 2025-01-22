function createUserStore() {
  let state = $state();
  let session = $state();

  return {
    get state() { return state },
    get session() { return session }
  }
}
