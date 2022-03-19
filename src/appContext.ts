import type { App } from "./App.ts";
import { Context } from "./Context.ts";

const context = new Context<App<unknown> | undefined>(undefined);

export const withApp = context.with.bind(context);
export const wrapApp = context.wrap.bind(context);
export const currentApp = <Entity>(): App<Entity> => {
  const app = context.current;
  if (!app) throw new Error("Expected an App context");
  return app as App<Entity>;
};
