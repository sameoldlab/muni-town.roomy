import { atprotoClient } from "./atproto";

export class UserStore {
  #state = $state();
  #session = $state();

  constructor() {}

  public static async build(): Promise<UserStore> {
    const result = await atprotoClient.init();
    if (result) {
      const { session, state } = result;
      if (state !== null) {
        this.#state = state;
        this.#session = session;
      }
    }
    return new UserStore() 
  }
}
