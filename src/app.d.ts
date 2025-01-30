// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
    
  }

  // WIP Message type for Chats
  // TODO: finalize with lexicon
  interface ChatEvent {
    content: string;
    timestamp: number;
    user: {
      name: string;
    };
  };
}

export {};