export type Mutable<T extends Record<string, unknown>> = {
  -readonly [K in keyof T]: T[K];
};
